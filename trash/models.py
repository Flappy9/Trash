from flask_sqlalchemy import SQLAlchemy
from datetime import timezone, datetime
db = SQLAlchemy()

def _utcnow():
    return datetime.now(timezone.utc)


class TrashCan(db.Model):
    __tablename__ = 'trash_cans'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(200), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    type = db.Column(db.String(200), nullable=False)
    photo_filename = db.Column(db.String(255), nullable = True)
    updated_at = db.Column(db.DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)