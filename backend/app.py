import csv
import hashlib
import io
import ipaddress
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import qrcode
import qrcode.image.svg
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt

DB_PATH = os.getenv('DB_PATH', '/data/careconnect.sqlite3')
PUBLIC_ORIGIN = os.getenv('PUBLIC_ORIGIN', 'http://localhost:5173').rstrip('/')
ITEM_IDS = [f's{i}' for i in range(1, 14)] + [f'i{i}' for i in range(1, 7)]
app = FastAPI(title='CareConnect private assessments')


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


@contextmanager
def db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize():
    with db() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY, synthetic INTEGER NOT NULL, consent_status TEXT NOT NULL, consent_version TEXT NOT NULL, created_at TEXT NOT NULL, withdrawn_at TEXT);
        CREATE TABLE IF NOT EXISTS consents(id TEXT PRIMARY KEY, participant_id TEXT REFERENCES participants(id), status TEXT, version TEXT, actor TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, role TEXT NOT NULL, actor TEXT NOT NULL, participant_id TEXT REFERENCES participants(id), expires_at TEXT NOT NULL, revoked_at TEXT);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, grant_id TEXT REFERENCES grants(id), csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY, participant_id TEXT REFERENCES participants(id), scheduled_date TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, instrument TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS drafts(assessment_id TEXT PRIMARY KEY REFERENCES schedules(id), revision INTEGER NOT NULL DEFAULT 0, answers TEXT NOT NULL DEFAULT '{}', text TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, updated_at TEXT);
        CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY, assessment_id TEXT UNIQUE REFERENCES schedules(id), idempotency_key TEXT NOT NULL, answers TEXT NOT NULL, text TEXT NOT NULL, instrument_version TEXT NOT NULL, language_version TEXT NOT NULL, completed_at TEXT NOT NULL, symptom_mean REAL, interference_mean REAL, symptom_answered INTEGER, interference_answered INTEGER);
        CREATE TABLE IF NOT EXISTS amendments(id TEXT PRIMARY KEY, submission_id TEXT REFERENCES submissions(id), answers TEXT NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, submission_id TEXT REFERENCES submissions(id), status TEXT NOT NULL, actor TEXT NOT NULL, reviewed_at TEXT NOT NULL, notes TEXT NOT NULL, follow_up_date TEXT, closure_outcome TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS interventions(id TEXT PRIMARY KEY, review_id TEXT REFERENCES reviews(id), notes TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, actor TEXT, action TEXT, record_id TEXT, created_at TEXT, reason TEXT);
        CREATE TABLE IF NOT EXISTS exchange_attempts(key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
        ''')
        if 'reason' not in [r[1] for r in c.execute('PRAGMA table_info(audit)')]:
            c.execute('ALTER TABLE audit ADD COLUMN reason TEXT')
        if 'instrument' not in [r[1] for r in c.execute('PRAGMA table_info(schedules)')]:
            c.execute("ALTER TABLE schedules ADD COLUMN instrument TEXT NOT NULL DEFAULT '{}'")


def migrate_instrument():
    with db() as c:
        c.execute("UPDATE schedules SET instrument=? WHERE instrument='{}'", (json.dumps(instrument(True)),))


initialize()


def instrument(synthetic=False):
    path = os.getenv('MATERIALS_PATH')
    if path and not synthetic:
        try:
            value = json.loads(Path(path).read_text())
            if not isinstance(value, dict):
                raise ValueError('Materials must be a JSON object')
            required = ['instrument_version', 'language_version', 'recall_period', 'authorization_reference', 'consent_version', 'consent_text', 'approval_reference']
            if all(isinstance(value.get(k), str) and value[k].strip() for k in required) and [x['id'] for x in value['items']] == ITEM_IDS and all(all(isinstance(x.get(k), str) and x[k].strip() for k in ['label', 'anchor_min', 'anchor_max']) for x in value['items']):
                return {**value, 'authorized': True}
        except (OSError, ValueError, KeyError, TypeError):
            pass
    return {'authorized': False, 'instrument_version': 'synthetic-placeholder-v1', 'language_version': 'en-demo', 'recall_period': 'Previous 24 hours (synthetic testing only)', 'items': [{'id': item, 'label': f'Synthetic {"symptom" if item.startswith("s") else "interference"} item {item[1:]}', 'anchor_min': '0', 'anchor_max': '10'} for item in ITEM_IDS]}


migrate_instrument()


def audit(c, actor, action, record, reason=None):
    c.execute('INSERT INTO audit(id,actor,action,record_id,created_at,reason) VALUES(?,?,?,?,?,?)', (secrets.token_hex(16), actor, action, record, now(), reason))


def session(request, roles=None):
    cookie = request.cookies.get('careconnect_session', '')
    with db() as c:
        row = c.execute('SELECT g.*,s.csrf FROM sessions s JOIN grants g ON g.id=s.grant_id WHERE s.token_hash=? AND s.expires_at>? AND g.expires_at>? AND g.revoked_at IS NULL', (digest(cookie), now(), now())).fetchone()
    if not row:
        raise HTTPException(401, 'Private link expired or revoked')
    if roles and row['role'] not in roles:
        raise HTTPException(403, 'Permission denied')
    if request.method not in ['GET', 'HEAD']:
        if request.headers.get('origin') != PUBLIC_ORIGIN or not secrets.compare_digest(request.headers.get('x-csrf-token', ''), row['csrf']):
            raise HTTPException(403, 'Invalid request origin or CSRF token')
    return dict(row)


def grant(c, role, actor, participant_id=None):
    token = secrets.token_urlsafe(32)
    ident = secrets.token_hex(16)
    c.execute('INSERT INTO grants VALUES(?,?,?,?,?,?,NULL)', (ident, digest(token), role, actor, participant_id, (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()))
    url = f'{PUBLIC_ORIGIN}/#token={token}'
    output = io.BytesIO()
    qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage).save(output)
    return {'id': ident, 'token': token, 'url': url, 'qr_svg': output.getvalue().decode()}


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Exchange(Model):
    token: str = Field(min_length=20, max_length=256)


@app.post('/api/access/exchange')
def exchange(body: Exchange, request: Request, response: Response):
    if request.headers.get('origin') != PUBLIC_ORIGIN:
        raise HTTPException(403, 'Invalid origin')
    client_ip = request.client.host if request.client else 'unknown'
    # Trust only the deployment proxy's overwritten header; backend must stay private.
    if os.getenv('TRUST_PROXY_HEADERS', 'false').lower() == 'true':
        forwarded = request.headers.get('x-careconnect-client-ip', '')
        try:
            client_ip = str(ipaddress.ip_address(forwarded))
        except ValueError:
            raise HTTPException(400, 'Invalid trusted proxy client address')
    key = digest(client_ip)
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        window = int(time.time()) // 60
        c.execute('INSERT INTO exchange_attempts VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window', (key, window))
        attempts = c.execute('SELECT count FROM exchange_attempts WHERE key=?', (key,)).fetchone()[0]
        c.commit()  # Persist failed attempts, including rejected credentials.
        if attempts > 20:
            raise HTTPException(429, 'Too many attempts; retry in one minute')
        g = c.execute('SELECT * FROM grants WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?', (digest(body.token), now())).fetchone()
        if not g:
            raise HTTPException(401, 'Private link expired or revoked')
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        expiry = datetime.now(timezone.utc) + timedelta(hours=12)
        c.execute('INSERT INTO sessions VALUES(?,?,?,?)', (digest(token), g['id'], csrf, expiry.isoformat()))
        audit(c, g['actor'], 'access_exchange', g['id'])
    response.set_cookie('careconnect_session', token, httponly=True, secure=os.getenv('COOKIE_SECURE', 'true').lower() == 'true', samesite='strict', max_age=43200, path='/api')
    return {'role': g['role'], 'actor': g['actor'], 'participant_id': g['participant_id'], 'csrf_token': csrf, 'instrument': instrument(), 'real_enrollment_enabled': instrument()['authorized']}


@app.get('/api/me')
def me(request: Request):
    s = session(request)
    return {k: s[k] for k in ['role', 'actor', 'participant_id']} | {'csrf_token': s['csrf'], 'instrument': instrument(), 'real_enrollment_enabled': instrument()['authorized']}


def participant(c, ident):
    p = c.execute('SELECT * FROM participants WHERE id=?', (ident,)).fetchone()
    if not p:
        raise HTTPException(404, 'Participant not found')
    return dict(p)


def assessment(c, ident, s, writable=False):
    a = c.execute('SELECT * FROM schedules WHERE id=?', (ident,)).fetchone()
    if not a:
        raise HTTPException(404, 'Assessment not found')
    if s['role'] == 'patient' and s['participant_id'] != a['participant_id']:
        raise HTTPException(403, 'Permission denied')
    p = participant(c, a['participant_id'])
    if writable and not p['synthetic'] and (not instrument()['authorized'] or p['consent_version'] != instrument()['consent_version'] or json.loads(a['instrument']) != instrument()):
        raise HTTPException(403, 'Authorized study materials changed or unavailable; collection paused')
    if writable and (p['withdrawn_at'] or p['consent_status'] != 'consented'):
        raise HTTPException(403, 'Collection stopped')
    return dict(a)


def decoded(row):
    value = dict(row)
    if 'answers' in value:
        value['answers'] = json.loads(value['answers'])
    return value


def scores(answers):
    symptom = [answers[k] for k in ITEM_IDS[:13] if k in answers]
    interference = [answers[k] for k in ITEM_IDS[13:] if k in answers]
    return {'symptom_answered': len(symptom), 'interference_answered': len(interference), 'symptom_mean': sum(symptom)/13 if len(symptom) == 13 else None, 'interference_mean': sum(interference)/6 if len(interference) == 6 else None}


def draft(c, ident):
    value = decoded(c.execute('SELECT * FROM drafts WHERE assessment_id=?', (ident,)).fetchone())
    return value | scores(value['answers'])


def schedules(c, participant_id=None):
    args = (participant_id,) if participant_id else ()
    rows = c.execute('SELECT s.*,d.revision,sub.id AS submission_id,sub.completed_at FROM schedules s JOIN drafts d ON d.assessment_id=s.id LEFT JOIN submissions sub ON sub.assessment_id=s.id' + (' WHERE s.participant_id=?' if participant_id else '') + ' ORDER BY s.scheduled_date,s.created_at', args).fetchall()
    today = datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()
    return [dict(r) | {'status': 'submitted' if r['submission_id'] else 'draft' if r['revision'] else 'missed' if r['scheduled_date'] < today else 'due'} for r in rows]


@app.get('/api/assessments')
def list_assessments(request: Request):
    s = session(request)
    with db() as c:
        return {'assessments': schedules(c, s['participant_id'] if s['role'] == 'patient' else None)}


@app.get('/api/assessments/{ident}')
def get_assessment(ident: str, request: Request):
    s = session(request)
    with db() as c:
        a = assessment(c, ident, s)
        sub = c.execute('SELECT * FROM submissions WHERE assessment_id=?', (ident,)).fetchone()
        a = next(x for x in schedules(c, a['participant_id']) if x['id'] == ident)
        return {'assessment': a, 'participant': participant(c, a['participant_id']), 'draft': draft(c, ident), 'submission': decoded(sub) if sub else None, 'instrument': json.loads(a['instrument'])}


class Draft(Model):
    revision: int = Field(ge=0)
    answers: dict[str, StrictInt]
    text: str = Field(default='', max_length=4000)
    position: int = Field(default=0, ge=0, le=18)


def validate_answers(answers):
    if any(k not in ITEM_IDS or type(v) is not int or not 0 <= v <= 10 for k, v in answers.items()):
        raise HTTPException(422, 'Unknown item or invalid integer score (0–10)')


@app.put('/api/assessments/{ident}/draft')
def save_draft(ident: str, body: Draft, request: Request):
    s = session(request, ['patient'])
    validate_answers(body.answers)
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        assessment(c, ident, s, True)
        if c.execute('SELECT 1 FROM submissions WHERE assessment_id=?', (ident,)).fetchone():
            raise HTTPException(409, 'Assessment already submitted')
        changed = c.execute('UPDATE drafts SET revision=revision+1,answers=?,text=?,position=?,updated_at=? WHERE assessment_id=? AND revision=?', (json.dumps(body.answers), body.text, body.position, now(), ident, body.revision)).rowcount
        if not changed:
            raise HTTPException(409, {'code': 'revision_conflict', 'draft': draft(c, ident)})
        audit(c, s['actor'], 'draft_saved', ident)
        return draft(c, ident)


class Submit(Model):
    revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=16, max_length=128)


@app.post('/api/assessments/{ident}/submit')
def submit(ident: str, body: Submit, request: Request):
    s = session(request, ['patient'])
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        a = assessment(c, ident, s, True)
        existing = c.execute('SELECT * FROM submissions WHERE assessment_id=?', (ident,)).fetchone()
        if existing:
            return decoded(existing)
        d = draft(c, ident)
        if d['revision'] != body.revision:
            raise HTTPException(409, {'code': 'revision_conflict', 'draft': d})
        if set(d['answers']) != set(ITEM_IDS):
            raise HTTPException(422, 'Explicit responses to all 19 items are required')
        ident_sub = secrets.token_hex(16)
        i = json.loads(a['instrument'])
        c.execute('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', (ident_sub, ident, body.idempotency_key, json.dumps(d['answers']), d['text'], i['instrument_version'], i['language_version'], now(), sum(d['answers'][k] for k in ITEM_IDS[:13])/13, sum(d['answers'][k] for k in ITEM_IDS[13:])/6, 13, 6))
        audit(c, s['actor'], 'submitted', ident_sub)
        return decoded(c.execute('SELECT * FROM submissions WHERE id=?', (ident_sub,)).fetchone())


class Enrollment(Model):
    participant_id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    synthetic: bool = True
    consent_status: str = Field(pattern=r'^(consented|pending|declined)$')
    consent_version: str = Field(min_length=1, max_length=128)


@app.post('/api/participants')
def enroll(body: Enrollment, request: Request):
    s = session(request, ['administrator', 'clinical'])
    i = instrument()
    if not body.synthetic and (not i['authorized'] or body.consent_version != i['consent_version']):
        raise HTTPException(403, 'Real enrollment requires authorized instrument and approved consent materials')
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        try:
            c.execute('INSERT INTO participants VALUES(?,?,?,?,?,NULL)', (body.participant_id, body.synthetic, body.consent_status, body.consent_version, now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'Participant ID already exists')
        c.execute('INSERT INTO consents VALUES(?,?,?,?,?,?)', (secrets.token_hex(16), body.participant_id, body.consent_status, body.consent_version, s['actor'], now()))
        audit(c, s['actor'], 'enrolled', body.participant_id)
        return participant(c, body.participant_id)


@app.get('/api/participants')
def participants(request: Request):
    session(request, ['administrator', 'clinical', 'research'])
    with db() as c:
        a = schedules(c)
        submitted = sum(x['status'] == 'submitted' for x in a)
        return {'participants': [dict(r) for r in c.execute('SELECT * FROM participants ORDER BY created_at DESC')], 'completion': {'scheduled': len(a), 'submitted': submitted, 'rate': submitted/len(a) if a else None}}


class Consent(Model):
    consent_status: str = Field(pattern=r'^(consented|pending|declined)$')
    consent_version: str = Field(min_length=1, max_length=128)


@app.post('/api/participants/{ident}/consent')
def update_consent(ident: str, body: Consent, request: Request):
    s = session(request, ['administrator', 'clinical'])
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        p = participant(c, ident)
        if p['withdrawn_at']:
            raise HTTPException(403, 'Withdrawn participants cannot resume collection')
        i = instrument()
        if not p['synthetic'] and (not i['authorized'] or i['consent_version'] != body.consent_version):
            raise HTTPException(403, 'Approved consent materials required')
        c.execute('UPDATE participants SET consent_status=?,consent_version=? WHERE id=?', (body.consent_status, body.consent_version, ident))
        c.execute('INSERT INTO consents VALUES(?,?,?,?,?,?)', (secrets.token_hex(16), ident, body.consent_status, body.consent_version, s['actor'], now()))
        if body.consent_status != 'consented':
            c.execute('UPDATE grants SET revoked_at=? WHERE participant_id=?', (now(), ident))
        audit(c, s['actor'], 'consent_recorded', ident)
        return participant(c, ident)


@app.get('/api/participants/{ident}')
def get_participant(ident: str, request: Request):
    session(request, ['administrator', 'clinical', 'research'])
    with db() as c:
        return {'participant': participant(c, ident), 'assessments': schedules(c, ident), 'submissions': [decoded(r) for r in c.execute('SELECT sub.* FROM submissions sub JOIN schedules s ON s.id=sub.assessment_id WHERE s.participant_id=?', (ident,))], 'reviews': [dict(r) for r in c.execute('SELECT r.* FROM reviews r JOIN submissions sub ON sub.id=r.submission_id JOIN schedules s ON s.id=sub.assessment_id WHERE s.participant_id=?', (ident,))], 'amendments': [decoded(r) for r in c.execute('SELECT a.* FROM amendments a JOIN submissions sub ON sub.id=a.submission_id JOIN schedules s ON s.id=sub.assessment_id WHERE s.participant_id=? ORDER BY a.created_at', (ident,))], 'consents': [dict(r) for r in c.execute('SELECT * FROM consents WHERE participant_id=? ORDER BY created_at', (ident,))], 'interventions': [dict(r) for r in c.execute('SELECT i.* FROM interventions i JOIN reviews r ON r.id=i.review_id JOIN submissions sub ON sub.id=r.submission_id JOIN schedules s ON s.id=sub.assessment_id WHERE s.participant_id=? ORDER BY i.created_at', (ident,))], 'grants': [dict(r) for r in c.execute('SELECT id,role,actor,expires_at,revoked_at FROM grants WHERE participant_id=?', (ident,))]}


class Schedule(Model):
    scheduled_date: str
    kind: str = Field(pattern=r'^(baseline|followup)$')


def date_valid(value):
    try:
        if datetime.strptime(value, '%Y-%m-%d').strftime('%Y-%m-%d') != value:
            raise ValueError()
    except ValueError:
        raise HTTPException(422, 'Date must be YYYY-MM-DD in Asia/Shanghai')


@app.post('/api/participants/{ident}/schedules')
def schedule(ident: str, body: Schedule, request: Request):
    s = session(request, ['administrator', 'clinical'])
    date_valid(body.scheduled_date)
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        p = participant(c, ident)
        if not p['synthetic'] and (not instrument()['authorized'] or p['consent_version'] != instrument()['consent_version']):
            raise HTTPException(403, 'Authorized study materials unavailable; collection paused')
        if p['withdrawn_at'] or p['consent_status'] != 'consented':
            raise HTTPException(403, 'Consent required and participant must be active')
        a = secrets.token_hex(16)
        c.execute('INSERT INTO schedules VALUES(?,?,?,?,?,?)', (a, ident, body.scheduled_date, body.kind, now(), json.dumps(instrument(bool(p['synthetic'])))))
        c.execute('INSERT INTO drafts(assessment_id) VALUES(?)', (a,))
        audit(c, s['actor'], 'scheduled', a)
        return {'id': a, 'participant_id': ident, **body.model_dump()}


@app.post('/api/participants/{ident}/grants')
def patient_grant(ident: str, request: Request):
    s = session(request, ['administrator', 'clinical'])
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        p = participant(c, ident)
        if not p['synthetic'] and (not instrument()['authorized'] or p['consent_version'] != instrument()['consent_version']):
            raise HTTPException(403, 'Authorized study materials unavailable; collection paused')
        if p['withdrawn_at'] or p['consent_status'] != 'consented':
            raise HTTPException(403, 'Consent required and participant must be active')
        g = grant(c, 'patient', ident, ident)
        audit(c, s['actor'], 'grant_created', g['id'])
        return g


class StaffGrant(Model):
    role: str = Field(pattern=r'^(administrator|clinical|research)$')
    actor: str = Field(min_length=1, max_length=128)


@app.get('/api/staff-grants')
def staff_grants(request: Request):
    session(request, ['administrator'])
    with db() as c:
        return {'grants': [dict(r) for r in c.execute('SELECT id,role,actor,expires_at,revoked_at FROM grants WHERE participant_id IS NULL ORDER BY actor')]}


@app.post('/api/staff-grants')
def staff_grant(body: StaffGrant, request: Request):
    s = session(request, ['administrator'])
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        g = grant(c, body.role, body.actor)
        audit(c, s['actor'], 'staff_grant_created', g['id'])
        return g


@app.post('/api/grants/{ident}/revoke')
def revoke(ident: str, request: Request):
    s = session(request, ['administrator', 'clinical'])
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        g = c.execute('SELECT * FROM grants WHERE id=?', (ident,)).fetchone()
        if not g:
            raise HTTPException(404, 'Grant not found')
        if s['role'] != 'administrator' and g['role'] != 'patient':
            raise HTTPException(403, 'Permission denied')
        c.execute('UPDATE grants SET revoked_at=? WHERE id=?', (now(), ident))
        audit(c, s['actor'], 'grant_revoked', ident)
    return {'revoked': True}


class Reason(Model):
    reason: str = Field(min_length=1, max_length=2000)


@app.post('/api/participants/{ident}/withdraw')
def withdraw(ident: str, body: Reason, request: Request):
    s = session(request, ['administrator', 'clinical'])
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        p = participant(c, ident)
        c.execute('UPDATE participants SET withdrawn_at=?,consent_status=\'withdrawn\' WHERE id=?', (now(), ident))
        c.execute('UPDATE grants SET revoked_at=? WHERE participant_id=?', (now(), ident))
        c.execute('INSERT INTO consents VALUES(?,?,?,?,?,?)', (secrets.token_hex(16), ident, 'withdrawn', p['consent_version'], s['actor'], now()))
        audit(c, s['actor'], 'withdrawn', ident, body.reason)
    return {'withdrawn': True}


class Review(Model):
    status: str = Field(pattern=r'^(reviewed|closed)$')
    notes: str = Field(default='', max_length=4000)
    follow_up_date: str | None = None
    closure_outcome: str = Field(default='', max_length=1000)


def submission_exists(c, ident):
    if not c.execute('SELECT 1 FROM submissions WHERE id=?', (ident,)).fetchone():
        raise HTTPException(404, 'Submission not found')


@app.get('/api/reviews')
def review_queue(request: Request):
    session(request, ['administrator', 'clinical', 'research'])
    with db() as c:
        return {'submissions': [decoded(r) for r in c.execute('SELECT sub.*,s.participant_id,s.scheduled_date,COALESCE((SELECT status FROM reviews WHERE submission_id=sub.id ORDER BY reviewed_at DESC LIMIT 1),\'pending\') AS review_status FROM submissions sub JOIN schedules s ON s.id=sub.assessment_id ORDER BY completed_at DESC')]}


@app.post('/api/submissions/{ident}/review')
def review(ident: str, body: Review, request: Request):
    s = session(request, ['administrator', 'clinical'])
    if body.follow_up_date:
        date_valid(body.follow_up_date)
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        submission_exists(c, ident)
        rid = secrets.token_hex(16)
        c.execute('INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?)', (rid, ident, body.status, s['actor'], now(), body.notes, body.follow_up_date, body.closure_outcome))
        if body.notes:
            c.execute('INSERT INTO interventions VALUES(?,?,?,?,?)', (secrets.token_hex(16), rid, body.notes, s['actor'], now()))
        audit(c, s['actor'], 'reviewed', ident)
        return dict(c.execute('SELECT * FROM reviews WHERE id=?', (rid,)).fetchone())


class Amendment(Reason):
    answers: dict[str, StrictInt]


@app.post('/api/submissions/{ident}/amend')
def amend(ident: str, body: Amendment, request: Request):
    s = session(request, ['administrator', 'clinical'])
    validate_answers(body.answers)
    if set(body.answers) != set(ITEM_IDS):
        raise HTTPException(422, 'All 19 amended answers required')
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        submission_exists(c, ident)
        aid = secrets.token_hex(16)
        c.execute('INSERT INTO amendments VALUES(?,?,?,?,?,?)', (aid, ident, json.dumps(body.answers), body.reason, s['actor'], now()))
        audit(c, s['actor'], 'amended', aid)
        return decoded(c.execute('SELECT * FROM amendments WHERE id=?', (aid,)).fetchone())


@app.get('/api/health')
def health():
    with db() as c:
        ok = c.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
    if not ok:
        raise HTTPException(503, 'Database check failed')
    return {'status': 'ok'}


@app.get('/api/exports/{name}.csv')
def export(name: str, request: Request):
    s = session(request, ['administrator', 'research'])
    queries = {'participants': 'SELECT * FROM participants', 'consents': 'SELECT * FROM consents', 'schedules': 'SELECT * FROM schedules', 'submissions': 'SELECT * FROM submissions', 'amendments': 'SELECT * FROM amendments', 'reviews': 'SELECT * FROM reviews', 'interventions': 'SELECT * FROM interventions', 'drafts': 'SELECT d.* FROM drafts d LEFT JOIN submissions s ON s.assessment_id=d.assessment_id WHERE s.id IS NULL'}
    with db() as c:
        if name == 'dictionary':
            rows = [{'field': item, 'description': 'Integer 0–10; absent means missing', 'domain': 'symptom' if item.startswith('s') else 'interference'} for item in ITEM_IDS] + [{'field': 'symptom_mean', 'description': 'Mean only with all 13 symptom responses; otherwise missing', 'domain': 'score'}, {'field': 'interference_mean', 'description': 'Mean only with all six interference responses; otherwise missing', 'domain': 'score'}, {'field': 'scheduled_date', 'description': 'Asia/Shanghai calendar date; all *_at timestamps UTC ISO8601', 'domain': 'time'}, {'field': 'drafts', 'description': 'Unfinished, excluded from other exports; not research submissions', 'domain': 'records'}]
            for table in ['participants', 'consents', 'schedules', 'submissions', 'amendments', 'reviews', 'interventions', 'drafts']:
                for field in [r[1] for r in c.execute(f'PRAGMA table_info({table})')]:
                    description = {'id': 'Immutable record identifier', 'participant_id': 'Pseudonymous participant foreign key', 'synthetic': '1 synthetic testing record, 0 approved real enrollment', 'consent_status': 'pending, consented, declined, or withdrawn', 'consent_version': 'Approved consent material version, or synthetic demo version', 'version': 'Consent material version', 'actor': 'Attributable staff identity or pseudonymous patient ID', 'assessment_id': 'Scheduled assessment foreign key', 'submission_id': 'Immutable original submission foreign key', 'review_id': 'Review foreign key', 'revision': 'Server draft compare-and-swap revision', 'answers': 'JSON item IDs to explicit integer 0–10; absent means missing', 'text': 'Participant free text', 'position': 'Zero-based questionnaire position', 'instrument': 'Pinned instrument and language snapshot', 'instrument_version': 'Instrument wording version', 'language_version': 'Language translation version', 'idempotency_key': 'Submission retry key', 'kind': 'baseline or followup', 'status': 'Consent or review workflow status', 'reason': 'Reason for linked immutable amendment', 'notes': 'Review and intervention free text', 'closure_outcome': 'Staff recorded closure result', 'follow_up_date': 'Planned follow-up Asia/Shanghai date; schedule created separately', 'scheduled_date': 'Asia/Shanghai calendar date', 'withdrawn_at': 'UTC withdrawal timestamp; null if active', 'symptom_answered': 'Number of symptom items explicitly answered, 0–13', 'interference_answered': 'Number of interference items explicitly answered, 0–6', 'symptom_mean': 'Mean only with all 13 symptom responses', 'interference_mean': 'Mean only with all six interference responses'}.get(field, 'UTC ISO8601 timestamp' if field.endswith('_at') else 'Persisted field')
                    rows.append({'field': field, 'description': description, 'domain': table})
            rows.extend([{'field': field, 'description': description, 'domain': 'responses'} for field, description in [('version_id', 'Original submission or linked amendment ID'), ('item_id', 's1–s13 symptoms; i1–i6 interference'), ('score', 'Explicit integer 0–10; empty is missing')]])
            rows.append({'field': 'responses.version_created_at', 'description': 'UTC version timestamp: original completion for original rows; amendment creation for amended rows. completed_at always remains the original assessment completion.', 'domain': 'time'})
            columns = ['field', 'description', 'domain']
        elif name == 'responses':
            rows = []
            for r in c.execute('SELECT sub.*,s.participant_id FROM submissions sub JOIN schedules s ON s.id=sub.assessment_id'):
                for item in ITEM_IDS:
                    rows.append({'participant_id': r['participant_id'], 'submission_id': r['id'], 'version_id': r['id'], 'item_id': item, 'score': json.loads(r['answers']).get(item), 'instrument_version': r['instrument_version'], 'language_version': r['language_version'], 'completed_at': r['completed_at'], 'version_created_at': r['completed_at']})
                for a in c.execute('SELECT * FROM amendments WHERE submission_id=?', (r['id'],)):
                    for item in ITEM_IDS:
                        rows.append({'participant_id': r['participant_id'], 'submission_id': r['id'], 'version_id': a['id'], 'item_id': item, 'score': json.loads(a['answers']).get(item), 'instrument_version': r['instrument_version'], 'language_version': r['language_version'], 'completed_at': r['completed_at'], 'version_created_at': a['created_at']})
            columns = ['participant_id', 'submission_id', 'version_id', 'item_id', 'score', 'instrument_version', 'language_version', 'completed_at', 'version_created_at']
        elif name in queries:
            cursor = c.execute(queries[name])
            columns = [x[0] for x in cursor.description]
            rows = [dict(r) for r in cursor]
            if name == 'drafts':
                rows = [r | scores(json.loads(r['answers'])) for r in rows]
                columns += ['symptom_answered', 'interference_answered', 'symptom_mean', 'interference_mean']
        else:
            raise HTTPException(404, 'Export not found')
        audit(c, s['actor'], f'export_{name}', name)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()
    # Prevent exported free text from becoming spreadsheet formulas.
    for row in rows:
        writer.writerow({k: "'" + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@', '\t', '\r')) else v for k, v in row.items()})
    return StreamingResponse(iter([output.getvalue()]), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="{name}.csv"', 'Cache-Control': 'no-store'})


@app.middleware('http')
async def private_cache(request: Request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response
