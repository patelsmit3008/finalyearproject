"""
Promotion Readiness Calculator for Helix AI

Calculates promotion readiness score based on:
- Average skill level
- Skill diversity
- Completed projects
- Experience years

Author: Helix AI System
"""

from typing import Dict, List, Optional


# Promotion readiness thresholds
LOW_THRESHOLD = 40
MEDIUM_THRESHOLD = 70

# Skill level weights (for scoring)
SKILL_LEVEL_WEIGHTS = {
    "Beginner": 0.25,
    "Intermediate": 0.50,
    "Advanced": 0.75,
    "Expert": 1.0
}

# Minimum requirements for promotion
MIN_SKILLS_FOR_PROMOTION = 3
MIN_ADVANCED_SKILLS = 1
MIN_COMPLETED_PROJECTS = 2


def calculate_promotion_readiness(
    skill_points: Dict[str, Dict],
    completed_projects: List[str],
    experience_years: float
) -> Dict:
    """
    Calculate promotion readiness score and level.
    
    Args:
        skill_points: Dict of {skill: {points, level, ...}}
        completed_projects: List of completed project IDs
        experience_years: Years of experience
        
    Returns:
        Dict: {
            score: float (0-100),
            level: str (Low, Medium, High),
            requirements: List[Dict] (checklist items)
        }
    """
    if not skill_points:
        return {
            "score": 0.0,
            "level": "Low",
            "requirements": [
                {"requirement": "Upload and analyze your resume", "met": False},
                {"requirement": "Complete at least 2 projects", "met": False},
                {"requirement": "Develop at least 3 skills", "met": False},
            ]
        }
    
    # Calculate average skill level score
    skill_scores = []
    advanced_skills = 0
    for skill, data in skill_points.items():
        level = data.get("level", "Beginner")
        weight = SKILL_LEVEL_WEIGHTS.get(level, 0.25)
        skill_scores.append(weight * 100)
        if level in ["Advanced", "Expert"]:
            advanced_skills += 1
    
    avg_skill_score = sum(skill_scores) / len(skill_scores) if skill_scores else 0
    
    # Calculate component scores
    skill_diversity_score = min(len(skill_points) / 5.0, 1.0) * 30  # Max 30 points for 5+ skills
    skill_level_score = avg_skill_score * 0.40  # Max 40 points
    project_score = min(len(completed_projects) / 3.0, 1.0) * 20  # Max 20 points for 3+ projects
    experience_score = min(experience_years / 5.0, 1.0) * 10  # Max 10 points for 5+ years
    
    # Total score
    total_score = skill_diversity_score + skill_level_score + project_score + experience_score
    total_score = min(100.0, max(0.0, total_score))
    
    # Determine level
    if total_score >= MEDIUM_THRESHOLD:
        level = "High"
    elif total_score >= LOW_THRESHOLD:
        level = "Medium"
    else:
        level = "Low"
    
    # Generate requirements checklist
    requirements = [
        {
            "requirement": f"Develop at least {MIN_SKILLS_FOR_PROMOTION} skills",
            "met": len(skill_points) >= MIN_SKILLS_FOR_PROMOTION
        },
        {
            "requirement": f"Reach Advanced level in at least {MIN_ADVANCED_SKILLS} skill",
            "met": advanced_skills >= MIN_ADVANCED_SKILLS
        },
        {
            "requirement": f"Complete at least {MIN_COMPLETED_PROJECTS} projects",
            "met": len(completed_projects) >= MIN_COMPLETED_PROJECTS
        },
        {
            "requirement": "Maintain average skill level above Intermediate",
            "met": avg_skill_score >= 50.0
        },
    ]
    
    return {
        "score": round(total_score, 1),
        "level": level,
        "requirements": requirements,
        "nextLevel": "Senior " + (list(skill_points.keys())[0] if skill_points else "Developer")
    }


if __name__ == "__main__":
    # Test promotion readiness
    print("Testing Promotion Readiness Calculator...")
    
    # Test case 1: Beginner profile
    skill_points_1 = {
        "Python": {"points": 50, "level": "Beginner", "nextThreshold": 100},
        "React": {"points": 30, "level": "Beginner", "nextThreshold": 100}
    }
    result_1 = calculate_promotion_readiness(skill_points_1, [], 1.0)
    print(f"\nBeginner Profile: Score={result_1['score']}, Level={result_1['level']}")
    print("Requirements:")
    for req in result_1['requirements']:
        print(f"  {'✓' if req['met'] else '✗'} {req['requirement']}")
    
    # Test case 2: Advanced profile
    skill_points_2 = {
        "Python": {"points": 400, "level": "Advanced", "nextThreshold": 600},
        "React": {"points": 350, "level": "Advanced", "nextThreshold": 600},
        "SQL": {"points": 200, "level": "Intermediate", "nextThreshold": 300},
        "AWS": {"points": 150, "level": "Intermediate", "nextThreshold": 300}
    }
    result_2 = calculate_promotion_readiness(skill_points_2, ["proj1", "proj2", "proj3"], 4.0)
    print(f"\nAdvanced Profile: Score={result_2['score']}, Level={result_2['level']}")
    print("Requirements:")
    for req in result_2['requirements']:
        print(f"  {'✓' if req['met'] else '✗'} {req['requirement']}")

