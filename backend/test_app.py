import importlib
import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def system(tmp_path, monkeypatch):
    monkeypatch.setenv('DB_PATH', str(tmp_path / 'test.sqlite3'))
    monkeypatch.setenv('PUBLIC_ORIGIN', 'http://testserver')
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    monkeypatch.delenv('MATERIALS_PATH', raising=False)
    import app
    app = importlib.reload(app)
    with app.db() as c:
        admin = app.grant(c, 'administrator', 'staff-a')
    def client(token):
        browser = TestClient(app.app)
        response = browser.post('/api/access/exchange', json={'token': token}, headers={'Origin': app.PUBLIC_ORIGIN})
        assert response.status_code == 200
        browser.headers.update({'Origin': app.PUBLIC_ORIGIN, 'X-CSRF-Token': response.json()['csrf_token']})
        return browser
    staff = client(admin['token'])
    return app, staff, client, tmp_path


def participant(staff, client, ident='SYN-1'):
    r = staff.post('/api/participants', json={'participant_id': ident, 'synthetic': True, 'consent_status': 'consented', 'consent_version': 'demo-consent'})
    assert r.status_code == 200, r.text
    a = staff.post(f'/api/participants/{ident}/schedules', json={'scheduled_date': '2020-01-01', 'kind': 'baseline'}).json()['id']
    g = staff.post(f'/api/participants/{ident}/grants').json()
    return client(g['token']), a, g


def test_full_cycle_and_export_restore(system):
    app, staff, client, tmp = system
    patient, aid, g = participant(staff, client)
    assert staff.get('/api/participants/SYN-1').json()['assessments'][0]['status'] == 'missed'
    assert patient.post(f'/api/assessments/{aid}/submit', json={'revision': 0, 'idempotency_key': 'test-key-123456789'}).status_code == 422
    answers = {k: 0 for k in app.ITEM_IDS}
    answers['s1'] = 10
    saved = patient.put(f'/api/assessments/{aid}/draft', json={'revision': 0, 'answers': answers, 'text': 'unfinished note', 'position': 7})
    assert saved.status_code == 200
    assert saved.json()['revision'] == 1
    assert staff.get(f'/api/assessments/{aid}').json()['draft']['answers'] == answers
    second = client(g['token'])
    assert second.get(f'/api/assessments/{aid}').json()['draft']['position'] == 7
    conflict = second.put(f'/api/assessments/{aid}/draft', json={'revision': 0, 'answers': {'s1': 1}})
    assert conflict.status_code == 409
    assert conflict.json()['detail']['draft']['answers'] == answers
    body = {'revision': 1, 'idempotency_key': 'test-key-123456789'}
    sub = patient.post(f'/api/assessments/{aid}/submit', json=body).json()
    assert sub['symptom_mean'] == 10/13 and sub['interference_mean'] == 0
    assert second.post(f'/api/assessments/{aid}/submit', json=body).json()['id'] == sub['id']
    assert aid not in staff.get('/api/exports/drafts.csv').text
    assert patient.put(f'/api/assessments/{aid}/draft', json={'revision': 1, 'answers': answers}).status_code == 409
    sid = sub['id']
    review = staff.post(f'/api/submissions/{sid}/review', json={'status': 'closed', 'notes': 'Synthetic intervention', 'follow_up_date': '2026-12-01', 'closure_outcome': 'complete'})
    assert review.status_code == 200
    assert staff.post('/api/participants/SYN-1/schedules', json={'scheduled_date': '2026-12-01', 'kind': 'followup'}).status_code == 200
    amended = {**answers, 's1': 5}
    assert staff.post(f'/api/submissions/{sid}/amend', json={'answers': amended, 'reason': 'Synthetic correction'}).status_code == 200
    assert patient.get(f'/api/assessments/{aid}').json()['submission']['answers']['s1'] == 10
    csv = staff.get('/api/exports/responses.csv')
    assert csv.status_code == 200 and len(csv.text.splitlines()) == 39
    import csv as csv_module
    import io
    rows = list(csv_module.DictReader(io.StringIO(csv.text)))
    assert all(row['completed_at'] == sub['completed_at'] for row in rows)
    assert rows[0]['version_created_at'] == sub['completed_at']
    assert rows[-1]['version_created_at'] != sub['completed_at']
    assert g['token'] not in staff.get('/api/exports/participants.csv').text
    rate = staff.get('/api/participants').json()['completion']
    assert rate == {'scheduled': 2, 'submitted': 1, 'rate': 0.5}
    from backup import backup, restore, check
    backup_file = backup(app.DB_PATH, tmp/'backups')
    restored = tmp/'restored.sqlite3'
    restore(backup_file, restored)
    check(restored)
    with sqlite3.connect(restored) as c:
        assert c.execute('SELECT COUNT(*) FROM submissions').fetchone()[0] == 1
        assert json.loads(c.execute('SELECT answers FROM submissions').fetchone()[0]) == answers
    with pytest.raises(ValueError):
        restore(backup_file, restored)
    app.initialize()
    assert patient.get(f'/api/assessments/{aid}').json()['submission']['id'] == sid
    assert staff.post('/api/participants/SYN-1/withdraw', json={'reason': 'withdraw test'}).status_code == 200
    assert patient.get('/api/me').status_code == 401
    assert client # history remains
    assert staff.get('/api/participants/SYN-1').json()['submissions'][0]['id'] == sid
    assert staff.post('/api/participants/SYN-1/schedules', json={'scheduled_date': '2026-12-02', 'kind': 'followup'}).status_code == 403


def test_permissions_validation_expiry_gate(system):
    app, staff, client, tmp = system
    p1, a1, g1 = participant(staff, client)
    p2, a2, g2 = participant(staff, client, 'SYN-2')
    assert p1.get(f'/api/assessments/{a2}').status_code == 403
    assert p1.get('/api/participants').status_code == 403
    assert p1.get('/api/exports/drafts.csv').status_code == 403
    assert p1.put(f'/api/assessments/{a1}/draft', json={'revision': 0, 'answers': {'s1': 11}}).status_code == 422
    assert p1.put(f'/api/assessments/{a1}/draft', json={'revision': 0, 'answers': {'s1': True}}).status_code == 422
    assert p1.put(f'/api/assessments/{a1}/draft', json={'revision': 0, 'answers': {'bad': 1}}).status_code == 422
    assert p1.put(f'/api/assessments/{a1}/draft', json={'revision': 0, 'answers': {'s1': 0}}, headers={'Origin': 'https://evil.example'}).status_code == 403
    assert p1.put(f'/api/assessments/{a1}/draft', json={'revision': 0, 'answers': {'s1': 0}}, headers={'X-CSRF-Token': 'bad'}).status_code == 403
    assert staff.post('/api/participants', json={'participant_id': 'REAL', 'synthetic': False, 'consent_status': 'consented', 'consent_version': 'demo'}).status_code == 403
    assert staff.post('/api/participants/SYN-1/schedules', json={'scheduled_date': '2026-02-31', 'kind': 'baseline'}).status_code == 422
    clinical = staff.post('/api/staff-grants', json={'role': 'clinical', 'actor': 'reviewer'}).json()
    clinician = client(clinical['token'])
    assert clinician.get('/api/exports/responses.csv').status_code == 403
    research = staff.post('/api/staff-grants', json={'role': 'research', 'actor': 'researcher'}).json()
    researcher = client(research['token'])
    assert researcher.post('/api/participants/SYN-1/withdraw', json={'reason': 'bad'}).status_code == 403
    assert researcher.get('/api/exports/drafts.csv').status_code == 200
    assert staff.post(f'/api/grants/{g1["id"]}/revoke').status_code == 200
    assert p1.get('/api/me').status_code == 401
    with app.db() as c:
        c.execute('UPDATE grants SET expires_at=? WHERE id=?', ((datetime.now(timezone.utc)-timedelta(days=1)).isoformat(), g2['id']))
    assert p2.get('/api/me').status_code == 401
    assert staff.get('/api/health').json()['status'] == 'ok'


def test_rate_limit(system):
    app, staff, client, tmp = system
    browser = TestClient(app.app)
    codes = [browser.post('/api/access/exchange', json={'token': 'x'*32}, headers={'Origin': app.PUBLIC_ORIGIN}).status_code for _ in range(25)]
    assert 401 in codes and codes[-1] == 429
    with app.db() as c:
        assert all('x'*32 not in str(dict(r)) for r in c.execute('SELECT * FROM grants'))


def test_material_gate_snapshot_consent_and_metadata(system, monkeypatch):
    app, staff, client, tmp = system
    path = tmp / 'materials.json'
    authorized = {**app.instrument(True), 'instrument_version': 'authorized-v1', 'language_version': 'zh-test', 'recall_period': '24h', 'authorization_reference': 'TEST ONLY', 'approval_reference': 'TEST ONLY', 'consent_version': 'consent-v1', 'consent_text': 'Synthetic authorization fixture'}
    path.write_text(json.dumps(authorized))
    monkeypatch.setenv('MATERIALS_PATH', str(path))
    assert app.instrument()['authorized']
    synthetic, aid, grant = participant(staff, client)
    assert synthetic.get(f'/api/assessments/{aid}').json()['instrument']['authorized'] is False
    assert staff.post('/api/participants', json={'participant_id': 'REAL-TEST', 'synthetic': False, 'consent_status': 'pending', 'consent_version': 'consent-v1'}).status_code == 200
    assert staff.post('/api/participants/REAL-TEST/grants').status_code == 403
    assert staff.post('/api/participants/REAL-TEST/consent', json={'consent_status': 'consented', 'consent_version': 'consent-v1'}).status_code == 200
    schedule = staff.post('/api/participants/REAL-TEST/schedules', json={'scheduled_date': '2026-10-15', 'kind': 'baseline'}).json()['id']
    real = client(staff.post('/api/participants/REAL-TEST/grants').json()['token'])
    assert real.get(f'/api/assessments/{schedule}').json()['instrument']['instrument_version'] == 'authorized-v1'
    authorized['items'][0]['label'] = 'changed wording'
    path.write_text(json.dumps(authorized))
    assert real.put(f'/api/assessments/{schedule}/draft', json={'revision': 0, 'answers': {'s1': 0}}).status_code == 403
    path.unlink()
    assert real.put(f'/api/assessments/{schedule}/draft', json={'revision': 0, 'answers': {'s1': 0}}).status_code == 403
    saved = synthetic.put(f'/api/assessments/{aid}/draft', json={'revision': 0, 'answers': {'s1': 0}}).json()
    assert saved['symptom_answered'] == 1 and saved['symptom_mean'] is None
    assert 'symptom_answered' in staff.get('/api/exports/drafts.csv').text
    assert 'clinical' not in staff.get('/api/staff-grants').json()['grants'][0]['role']
    assert staff.post('/api/participants/SYN-1/consent', json={'consent_status': 'declined', 'consent_version': 'demo-v2'}).status_code == 200
    assert synthetic.get('/api/me').status_code == 401
    assert len(staff.get('/api/participants/SYN-1').json()['consents']) == 2


def test_verified_proxy_rate_limits(system, monkeypatch):
    app, staff, client, tmp = system
    browser = TestClient(app.app)
    # Untrusted headers cannot choose a separate rate-limit bucket.
    monkeypatch.setenv('TRUST_PROXY_HEADERS', 'false')
    codes = [browser.post('/api/access/exchange', json={'token': 'x'*32}, headers={'Origin': app.PUBLIC_ORIGIN, 'X-Careconnect-Client-IP': f'192.0.2.{i}'}).status_code for i in range(1, 25)]
    assert codes[-1] == 429
    monkeypatch.setenv('TRUST_PROXY_HEADERS', 'true')
    headers = {'Origin': app.PUBLIC_ORIGIN, 'X-Careconnect-Client-IP': '192.0.2.100'}
    codes = [browser.post('/api/access/exchange', json={'token': 'x'*32}, headers=headers).status_code for _ in range(21)]
    assert codes[-1] == 429
    headers['X-Careconnect-Client-IP'] = '192.0.2.101'
    assert browser.post('/api/access/exchange', json={'token': 'x'*32}, headers=headers).status_code == 401
    headers['X-Careconnect-Client-IP'] = 'forged-invalid'
    assert browser.post('/api/access/exchange', json={'token': 'x'*32}, headers=headers).status_code == 400


def test_nonobject_materials_fail_closed(system, monkeypatch):
    app, staff, client, tmp = system
    path = tmp / 'invalid-materials.json'
    monkeypatch.setenv('MATERIALS_PATH', str(path))
    for payload in [[], None, 'text', 5, {'items': [None]}]:
        path.write_text(json.dumps(payload))
        assert app.instrument()['authorized'] is False
        assert staff.get('/api/me').status_code == 200


def test_changed_consent_requires_renewal(system, monkeypatch):
    app, staff, client, tmp = system
    path = tmp / 'materials.json'
    material = {**app.instrument(True), 'authorization_reference': 'TEST', 'approval_reference': 'TEST', 'consent_version': 'v1', 'consent_text': 'TEST'}
    path.write_text(json.dumps(material))
    monkeypatch.setenv('MATERIALS_PATH', str(path))
    assert staff.post('/api/participants', json={'participant_id': 'REAL', 'synthetic': False, 'consent_status': 'consented', 'consent_version': 'v1'}).status_code == 200
    payload = {'scheduled_date': '2020-01-01', 'kind': 'baseline'}
    old = staff.post('/api/participants/REAL/schedules', json=payload).json()['id']
    patient = client(staff.post('/api/participants/REAL/grants').json()['token'])
    assert patient.get(f'/api/assessments/{old}').json()['assessment']['status'] == 'missed'
    material['consent_version'] = 'v2'
    path.write_text(json.dumps(material))
    assert staff.post('/api/participants/REAL/schedules', json=payload).status_code == 403
    assert staff.post('/api/participants/REAL/grants').status_code == 403
    assert patient.put(f'/api/assessments/{old}/draft', json={'revision': 0, 'answers': {'s1': 0}}).status_code == 403
    assert staff.post('/api/participants/REAL/consent', json={'consent_status': 'consented', 'consent_version': 'v2'}).status_code == 200
    new = staff.post('/api/participants/REAL/schedules', json=payload).json()['id']
    assert staff.post('/api/participants/REAL/grants').status_code == 200
    assert patient.put(f'/api/assessments/{old}/draft', json={'revision': 0, 'answers': {'s1': 0}}).status_code == 403
    assert patient.put(f'/api/assessments/{new}/draft', json={'revision': 0, 'answers': {'s1': 0}}).status_code == 200


def test_backup_retention_preserves_recent_and_unrelated_files(system):
    import os
    import time
    from backup import backup
    app, _, _, tmp = system
    folder = tmp / 'retention'
    folder.mkdir()
    stale = folder / 'careconnect-old.sqlite3'
    recent = folder / 'careconnect-recent.sqlite3'
    unrelated = folder / 'other-study.sqlite3'
    for path in [stale, recent, unrelated]:
        path.write_text('retention fixture')
    old_time = time.time() - 31 * 86400
    for path in [stale, unrelated]:
        os.utime(path, (old_time, old_time))
    target = backup(app.DB_PATH, folder)
    assert target.exists() and target.stat().st_mode & 0o777 == 0o600
    assert not stale.exists()
    assert recent.exists() and unrelated.exists()
