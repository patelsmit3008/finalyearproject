"""
Skill Scoring Engine for Helix AI

This module handles skill point initialization and level calculation.
Skills are initialized from resume analysis and updated based on project contributions.

Author: Helix AI System
"""

from typing import Dict, List, Optional
from datetime import datetime, timezone


# Skill level thresholds (points required)
BEGINNER_THRESHOLD = 0
INTERMEDIATE_THRESHOLD = 100
ADVANCED_THRESHOLD = 300
EXPERT_THRESHOLD = 600

# Initial skill points from resume (based on experience)
BASE_POINTS_FROM_RESUME = 20  # Base points for having skill in resume
EXPERIENCE_POINTS_PER_YEAR = 10  # Additional points per year of experience
MAX_RESUME_POINTS = 100  # Cap for resume-based points


def calculate_skill_level(points: int) -> str:
    """
    Calculate skill level based on points.
    
    Args:
        points: Total skill points
        
    Returns:
        str: Skill level (Beginner, Intermediate, Advanced, Expert)
    """
    if points >= EXPERT_THRESHOLD:
        return "Expert"
    elif points >= ADVANCED_THRESHOLD:
        return "Advanced"
    elif points >= INTERMEDIATE_THRESHOLD:
        return "Intermediate"
    else:
        return "Beginner"


def get_next_level_threshold(current_level: str) -> Optional[int]:
    """
    Get the points threshold for the next level.
    
    Args:
        current_level: Current skill level
        
    Returns:
        int or None: Points threshold for next level, or None if at max level
    """
    level_map = {
        "Beginner": INTERMEDIATE_THRESHOLD,
        "Intermediate": ADVANCED_THRESHOLD,
        "Advanced": EXPERT_THRESHOLD,
        "Expert": None  # Max level
    }
    return level_map.get(current_level, INTERMEDIATE_THRESHOLD)


def initialize_skill_points_from_resume(
    skills: List[str],
    experience_years: float
) -> Dict[str, Dict]:
    """
    Initialize skill points from resume analysis.
    
    Each skill gets base points plus experience-based bonus.
    Points are capped at MAX_RESUME_POINTS.
    
    Args:
        skills: List of skill names
        experience_years: Years of experience
        
    Returns:
        Dict: {skill_name: {points: int, level: str, nextThreshold: int}}
    """
    skill_points = {}
    
    # Calculate experience bonus (capped)
    experience_bonus = min(experience_years * EXPERIENCE_POINTS_PER_YEAR, MAX_RESUME_POINTS - BASE_POINTS_FROM_RESUME)
    base_points = BASE_POINTS_FROM_RESUME + int(experience_bonus)
    
    for skill in skills:
        points = min(base_points, MAX_RESUME_POINTS)
        level = calculate_skill_level(points)
        next_threshold = get_next_level_threshold(level)
        
        skill_points[skill] = {
            "points": points,
            "level": level,
            "nextThreshold": next_threshold,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "source": "resume"
        }
    
    return skill_points


def update_skill_points_from_project(
    current_skill_points: Dict[str, Dict],
    skill: str,
    points_awarded: int
) -> Dict[str, Dict]:
    """
    Update skill points after project contribution validation.
    
    Args:
        current_skill_points: Current skill points dictionary
        skill: Skill name
        points_awarded: Points to add
        
    Returns:
        Dict: Updated skill points dictionary
    """
    if skill not in current_skill_points:
        # New skill from project
        current_skill_points[skill] = {
            "points": 0,
            "level": "Beginner",
            "nextThreshold": INTERMEDIATE_THRESHOLD,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "source": "project"
        }
    
    # Add points
    current_skill_points[skill]["points"] += points_awarded
    
    # Recalculate level
    new_level = calculate_skill_level(current_skill_points[skill]["points"])
    current_skill_points[skill]["level"] = new_level
    current_skill_points[skill]["nextThreshold"] = get_next_level_threshold(new_level)
    current_skill_points[skill]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    
    return current_skill_points


def calculate_skill_progress_percentage(
    current_points: int,
    next_threshold: Optional[int]
) -> int:
    """
    Calculate progress percentage toward next level.
    
    Args:
        current_points: Current skill points
        next_threshold: Points required for next level (None if max level)
        
    Returns:
        int: Progress percentage (0-100)
    """
    if next_threshold is None:
        return 100  # Max level
    
    if next_threshold == 0:
        return 0
    
    # Calculate progress from current level threshold
    current_level = calculate_skill_level(current_points)
    current_threshold = {
        "Beginner": BEGINNER_THRESHOLD,
        "Intermediate": INTERMEDIATE_THRESHOLD,
        "Advanced": ADVANCED_THRESHOLD,
        "Expert": EXPERT_THRESHOLD
    }.get(current_level, BEGINNER_THRESHOLD)
    
    # Progress within current level range
    level_range = next_threshold - current_threshold
    if level_range == 0:
        return 100
    
    progress_in_level = current_points - current_threshold
    percentage = int((progress_in_level / level_range) * 100)
    
    return min(100, max(0, percentage))


if __name__ == "__main__":
    # Test skill scoring
    print("Testing Skill Scoring Engine...")
    
    # Test initialization
    skills = ["Python", "React", "SQL"]
    experience = 3.5
    skill_points = initialize_skill_points_from_resume(skills, experience)
    
    print("\nInitialized Skills from Resume:")
    for skill, data in skill_points.items():
        print(f"  {skill}: {data['points']} pts, Level: {data['level']}, Next: {data['nextThreshold']}")
    
    # Test level calculation
    print("\nLevel Thresholds:")
    for points in [0, 50, 150, 400, 700]:
        level = calculate_skill_level(points)
        print(f"  {points} pts → {level}")
    
    # Test progress calculation
    print("\nProgress Calculation:")
    test_cases = [
        (50, INTERMEDIATE_THRESHOLD),  # Beginner → Intermediate
        (200, ADVANCED_THRESHOLD),     # Intermediate → Advanced
        (500, EXPERT_THRESHOLD),       # Advanced → Expert
        (700, None),                   # Expert (max)
    ]
    for points, next_threshold in test_cases:
        progress = calculate_skill_progress_percentage(points, next_threshold)
        print(f"  {points} pts (next: {next_threshold}) → {progress}%")

