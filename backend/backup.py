"""Consistent SQLite backup and safe restore (stop application before replacing its DB)."""
import argparse
import os
from pathlib import Path
import sqlite3
import time
from datetime import datetime, timezone


def check(path):
    with sqlite3.connect(f'file:{Path(path).resolve()}?mode=ro', uri=True) as connection:
        result = connection.execute('PRAGMA integrity_check').fetchone()[0]
        if result != 'ok':
            raise RuntimeError(f'Database integrity check failed: {result}')
        connection.execute('SELECT COUNT(*) FROM participants').fetchone()


def backup(source, directory):
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / ('careconnect-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.sqlite3')
    temporary = target.with_suffix('.tmp')
    try:
        with sqlite3.connect(f'file:{Path(source).resolve()}?mode=ro', uri=True) as original, sqlite3.connect(temporary) as copy:
            original.backup(copy)
        check(temporary)
        temporary.chmod(0o600)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    for old in folder.glob('careconnect-*.sqlite3'):
        if old.stat().st_mtime < time.time() - 30 * 86400:
            old.unlink()
    return target


def restore(source, destination):
    check(source)
    target = Path(destination)
    if target.exists() or Path(str(target) + '-wal').exists() or Path(str(target) + '-shm').exists():
        raise ValueError('Restore destination must be new; stop service and preserve the original database first')
    target.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(f'file:{Path(source).resolve()}?mode=ro', uri=True) as original, sqlite3.connect(target) as copy:
        original.backup(copy)
    target.chmod(0o600)
    check(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['backup', 'loop', 'restore', 'check'])
    parser.add_argument('--database', default=os.getenv('DB_PATH', '/data/careconnect.sqlite3'))
    parser.add_argument('--directory', default='/backups')
    parser.add_argument('--source')
    parser.add_argument('--destination')
    args = parser.parse_args()
    if args.command == 'restore':
        if not args.source or not args.destination:
            parser.error('restore requires --source and --destination')
        restore(args.source, args.destination)
    elif args.command == 'check':
        check(args.database)
    elif args.command == 'backup':
        print(backup(args.database, args.directory))
    else:
        while True:
            try:
                backup(args.database, args.directory)
                print('Daily backup verified', flush=True)
            except (OSError, sqlite3.Error, RuntimeError) as error:
                print(f'Backup failed: {type(error).__name__}', flush=True)
                time.sleep(60)
                continue
            time.sleep(86400)
