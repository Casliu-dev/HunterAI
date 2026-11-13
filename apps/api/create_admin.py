import sys
sys.path.insert(0, '.')

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import User
from sqlalchemy import select

db = SessionLocal()
existing = db.execute(select(User).where(User.email == 'casliudev1@proton.me')).scalar_one_or_none()
if existing:
    print('User already exists')
else:
    user = User(email='casliudev1@proton.me', name='Admin', hashed_password=hash_password('T1U3th6q69wO72'), is_verified=True)
    db.add(user)
    db.commit()
    print('Admin created:', user.id)
