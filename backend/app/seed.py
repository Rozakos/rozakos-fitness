from sqlalchemy.orm import Session

from .models import Exercise

# (name, muscle_group, equipment, default rest seconds)
BUILTIN_EXERCISES: list[tuple[str, str, str, int]] = [
    # Chest
    ("Barbell Bench Press", "chest", "barbell", 180),
    ("Incline Barbell Bench Press", "chest", "barbell", 180),
    ("Dumbbell Bench Press", "chest", "dumbbell", 150),
    ("Incline Dumbbell Press", "chest", "dumbbell", 150),
    ("Machine Chest Press", "chest", "machine", 120),
    ("Cable Fly", "chest", "cable", 90),
    ("Pec Deck", "chest", "machine", 90),
    ("Push-Up", "chest", "bodyweight", 90),
    ("Dip", "chest", "bodyweight", 150),
    # Back
    ("Deadlift", "back", "barbell", 240),
    ("Barbell Row", "back", "barbell", 180),
    ("Pull-Up", "back", "bodyweight", 150),
    ("Chin-Up", "back", "bodyweight", 150),
    ("Lat Pulldown", "back", "cable", 120),
    ("Seated Cable Row", "back", "cable", 120),
    ("Dumbbell Row", "back", "dumbbell", 120),
    ("T-Bar Row", "back", "barbell", 150),
    ("Face Pull", "back", "cable", 90),
    ("Rack Pull", "back", "barbell", 210),
    # Shoulders
    ("Overhead Press", "shoulders", "barbell", 180),
    ("Seated Dumbbell Shoulder Press", "shoulders", "dumbbell", 150),
    ("Machine Shoulder Press", "shoulders", "machine", 120),
    ("Lateral Raise", "shoulders", "dumbbell", 60),
    ("Cable Lateral Raise", "shoulders", "cable", 60),
    ("Rear Delt Fly", "shoulders", "dumbbell", 60),
    ("Upright Row", "shoulders", "barbell", 120),
    ("Arnold Press", "shoulders", "dumbbell", 150),
    # Biceps
    ("Barbell Curl", "biceps", "barbell", 90),
    ("Dumbbell Curl", "biceps", "dumbbell", 90),
    ("Hammer Curl", "biceps", "dumbbell", 90),
    ("Incline Dumbbell Curl", "biceps", "dumbbell", 90),
    ("Preacher Curl", "biceps", "machine", 90),
    ("Cable Curl", "biceps", "cable", 90),
    # Triceps
    ("Close-Grip Bench Press", "triceps", "barbell", 150),
    ("Skull Crusher", "triceps", "barbell", 120),
    ("Triceps Pushdown", "triceps", "cable", 90),
    ("Overhead Cable Extension", "triceps", "cable", 90),
    ("Dumbbell Overhead Extension", "triceps", "dumbbell", 90),
    # Quads
    ("Back Squat", "quads", "barbell", 240),
    ("Front Squat", "quads", "barbell", 210),
    ("Leg Press", "quads", "machine", 180),
    ("Hack Squat", "quads", "machine", 180),
    ("Bulgarian Split Squat", "quads", "dumbbell", 120),
    ("Leg Extension", "quads", "machine", 90),
    ("Walking Lunge", "quads", "dumbbell", 120),
    ("Goblet Squat", "quads", "dumbbell", 120),
    # Hamstrings
    ("Romanian Deadlift", "hamstrings", "barbell", 180),
    ("Lying Leg Curl", "hamstrings", "machine", 90),
    ("Seated Leg Curl", "hamstrings", "machine", 90),
    ("Good Morning", "hamstrings", "barbell", 150),
    ("Nordic Curl", "hamstrings", "bodyweight", 120),
    # Glutes
    ("Hip Thrust", "glutes", "barbell", 150),
    ("Glute Kickback", "glutes", "cable", 90),
    ("Sumo Deadlift", "glutes", "barbell", 240),
    # Calves
    ("Standing Calf Raise", "calves", "machine", 60),
    ("Seated Calf Raise", "calves", "machine", 60),
    # Core
    ("Plank", "core", "bodyweight", 60),
    ("Hanging Leg Raise", "core", "bodyweight", 90),
    ("Cable Crunch", "core", "cable", 90),
    ("Ab Wheel Rollout", "core", "bodyweight", 90),
    ("Russian Twist", "core", "bodyweight", 60),
]


def seed_exercises(db: Session) -> int:
    """Insert built-in exercises that don't exist yet. Returns number inserted."""
    existing = {
        name for (name,) in db.query(Exercise.name).filter(Exercise.is_custom.is_(False)).all()
    }
    inserted = 0
    for name, muscle_group, equipment, rest in BUILTIN_EXERCISES:
        if name in existing:
            continue
        db.add(
            Exercise(
                name=name,
                muscle_group=muscle_group,
                equipment=equipment,
                rest_seconds_default=rest,
                is_custom=False,
            )
        )
        inserted += 1
    db.commit()
    return inserted
