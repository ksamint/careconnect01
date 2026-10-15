"""Issue a staff credential locally; stdout contains the private link, never log it."""
import argparse
from app import audit, db, grant

parser = argparse.ArgumentParser()
parser.add_argument('--actor', required=True)
parser.add_argument('--role', choices=['administrator', 'clinical', 'research'], default='administrator')
args = parser.parse_args()
if not 1 <= len(args.actor) <= 128:
    parser.error('actor must contain 1–128 characters')
with db() as connection:
    result = grant(connection, args.role, args.actor)
    audit(connection, args.actor, 'bootstrap_staff_grant', result['id'])
print(result['url'])
