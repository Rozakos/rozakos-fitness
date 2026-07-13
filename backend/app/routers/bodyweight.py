from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BodyweightEntry, User
from ..schemas import BodyweightIn, BodyweightOut
from ..security import get_current_user

router = APIRouter(prefix="/bodyweight", tags=["bodyweight"])


@router.get("", response_model=list[BodyweightOut])
def list_entries(
    limit: int = 90, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    return (
        db.query(BodyweightEntry)
        .filter(BodyweightEntry.user_id == user.id)
        .order_by(BodyweightEntry.date.desc())
        .limit(limit)
        .all()
    )


@router.post("", response_model=BodyweightOut, status_code=status.HTTP_201_CREATED)
def log_entry(
    body: BodyweightIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    entry = (
        db.query(BodyweightEntry)
        .filter(BodyweightEntry.user_id == user.id, BodyweightEntry.date == body.date)
        .first()
    )
    if entry is not None:
        entry.weight_kg = body.weight_kg  # one entry per day, latest wins
    else:
        entry = BodyweightEntry(user_id=user.id, date=body.date, weight_kg=body.weight_kg)
        db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    entry = (
        db.query(BodyweightEntry)
        .filter(BodyweightEntry.id == entry_id, BodyweightEntry.user_id == user.id)
        .first()
    )
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    db.delete(entry)
    db.commit()
