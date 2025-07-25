from fastcore.all import *
from fastlite import *
from fastmigrate import *
from models import db, users, User

def add_passkey_credential(uid, credential_id, public_key, counter=0):
    "Add a new passkey credential for a user"
    from datetime import datetime
    from uuid import uuid4
    return db.t.webauthncredentials.insert(
        id=str(uuid4()),  # Generate unique ID for this credential record
        uid=uid,
        credential_id=credential_id, 
        public_key=public_key,
        counter=counter,
        created_at=int(datetime.now().timestamp())
    )

def get_passkey_for_auth(credential_id):
    "Get a passkey credential for authentication by credential_id"
    creds = db.t.webauthncredentials("credential_id=?", where_args=(credential_id,))
    return creds[0] if creds else None

def update_passkey_counter(credential_id, new_counter):
    "Update the counter for a passkey credential after successful authentication"
    cred = get_passkey_for_auth(credential_id)
    if cred and new_counter > cred['counter']:
        db.t.webauthncredentials.update(dict(id=cred['id'], counter=new_counter))
        return True
    return False

