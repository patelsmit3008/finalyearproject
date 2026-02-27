"""
Project Recommendation Engine for Helix AI

This module calculates project recommendations based on skill matching between
employee resume skills and project required skills. Recommendations are stored
in user_progress/{userId}.recommendedProjects.

Author: Helix AI System
"""

from typing import List, Dict, Optional
from datetime import datetime, timezone


def normalize_skill_name(skill: str) -> str:
    """
    Normalize skill name for comparison (case-insensitive, trimmed).
    
    Args:
        skill: Skill name
        
    Returns:
        Normalized skill name
    """
    return skill.strip().lower()


def calculate_skill_match_percentage(
    resume_skills: List[str],
    project_required_skills: List[str]
) -> float:
    """
    Calculate match percentage between resume skills and project required skills.
    
    Formula: (matched_skills / total_required_skills) * 100
    
    Args:
        resume_skills: List of skills from resume
        project_required_skills: List of required skills for project
        
    Returns:
        float: Match percentage (0-100)
    """
    if not project_required_skills:
        return 0.0
    
    if not resume_skills:
        return 0.0
    
    # Normalize skills for comparison
    normalized_resume_skills = [normalize_skill_name(s) for s in resume_skills]
    normalized_project_skills = [normalize_skill_name(s) for s in project_required_skills]
    
    # Count matches
    matched_count = sum(1 for skill in normalized_project_skills if skill in normalized_resume_skills)
    
    # Calculate percentage
    match_percentage = (matched_count / len(normalized_project_skills)) * 100.0
    
    return round(match_percentage, 2)


def get_matched_skills(
    resume_skills: List[str],
    project_required_skills: List[str]
) -> List[str]:
    """
    Get list of skills that match between resume and project.
    
    Args:
        resume_skills: List of skills from resume
        project_required_skills: List of required skills for project
        
    Returns:
        List of matched skill names (original case from project)
    """
    if not resume_skills or not project_required_skills:
        return []
    
    # Normalize resume skills for comparison
    normalized_resume_skills = [normalize_skill_name(s) for s in resume_skills]
    
    # Find matches (preserve original case from project)
    matched = []
    for project_skill in project_required_skills:
        if normalize_skill_name(project_skill) in normalized_resume_skills:
            matched.append(project_skill)
    
    return matched


def get_missing_skills(
    resume_skills: List[str],
    project_required_skills: List[str]
) -> List[str]:
    """
    Get list of required skills that are missing from resume.
    
    Args:
        resume_skills: List of skills from resume
        project_required_skills: List of required skills for project
        
    Returns:
        List of missing skill names
    """
    if not project_required_skills:
        return []
    
    matched = get_matched_skills(resume_skills, project_required_skills)
    normalized_matched = [normalize_skill_name(s) for s in matched]
    
    # Find missing skills
    missing = []
    for project_skill in project_required_skills:
        if normalize_skill_name(project_skill) not in normalized_matched:
            missing.append(project_skill)
    
    return missing


def calculate_project_recommendations(
    resume_skills: List[str],
    projects: List[Dict],
    top_n: int = 5
) -> List[Dict]:
    """
    Calculate project recommendations based on skill matching.
    
    Args:
        resume_skills: List of skills from resume
        projects: List of project dictionaries from Firestore
        top_n: Number of top recommendations to return (default: 5)
        
    Returns:
        List of recommended project dictionaries with match percentage
    """
    if not resume_skills or not projects:
        return []
    
    recommendations = []
    
    for project in projects:
        # Get required skills (handle backward compatibility)
        required_skills = project.get('requiredSkills', [])
        if not required_skills and project.get('requiredSkill'):
            required_skills = [project.get('requiredSkill')]
        
        if not required_skills:
            continue  # Skip projects with no required skills
        
        # Calculate match percentage
        match_percentage = calculate_skill_match_percentage(resume_skills, required_skills)
        
        # Get matched and missing skills
        matched_skills = get_matched_skills(resume_skills, required_skills)
        missing_skills = get_missing_skills(resume_skills, required_skills)
        
        # Only include projects with at least some match
        if match_percentage > 0:
            recommendations.append({
                'projectId': project.get('projectId') or project.get('id'),
                'projectName': project.get('projectName') or project.get('name') or 'Unknown Project',
                'matchPercentage': match_percentage,
                'matchedSkills': matched_skills,
                'missingSkills': missing_skills,
                'requiredSkills': required_skills,
                'status': project.get('status', 'Planning'),
                'minimumHelixScore': project.get('minimumHelixScore') or project.get('minHelixScore') or 0,
                'description': project.get('description'),
                'domain': project.get('domain'),
            })
    
    # Sort by match percentage (descending)
    recommendations.sort(key=lambda x: x['matchPercentage'], reverse=True)
    
    # Return top N recommendations
    return recommendations[:top_n]


if __name__ == "__main__":
    # Test project recommendation engine
    print("Testing Project Recommendation Engine...")
    
    # Mock resume skills
    resume_skills = ["Python", "React", "SQL", "AWS", "Docker"]
    
    # Mock projects
    projects = [
        {
            'projectId': 'proj1',
            'projectName': 'E-commerce Platform',
            'requiredSkills': ['Python', 'React', 'SQL'],
            'status': 'In Progress'
        },
        {
            'projectId': 'proj2',
            'projectName': 'ML Model Training',
            'requiredSkills': ['Python', 'TensorFlow', 'AWS'],
            'status': 'Planning'
        },
        {
            'projectId': 'proj3',
            'projectName': 'Mobile App',
            'requiredSkills': ['React Native', 'TypeScript'],
            'status': 'In Progress'
        },
    ]
    
    recommendations = calculate_project_recommendations(resume_skills, projects, top_n=3)
    
    print(f"\nGenerated {len(recommendations)} recommendations:")
    for rec in recommendations:
        print(f"  {rec['projectName']}: {rec['matchPercentage']}% match")
        print(f"    Matched: {rec['matchedSkills']}")
        print(f"    Missing: {rec['missingSkills']}")

