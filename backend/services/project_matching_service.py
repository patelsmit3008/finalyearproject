"""
Project Matching Service for Employee-Project Skill Matching

This service matches employee resumes to live internal projects based on:
- Required skills match
- Optional skills match
- Domain alignment
- Experience level vs project difficulty

Scoring:
- +3 points for each required skill match
- +1 point for each optional skill match
- +2 points if domain matches
- +1 point if experience >= project difficulty level

Results are normalized to 0-100 and categorized:
- Strong Match (score ≥ 70)
- Good Match (40-69)
- Skill Gap Match (< 40)

Author: Helix AI System
"""

from typing import List, Dict, Optional
from pydantic import BaseModel, Field
from models.core_models import ResumeProfile, Project


class ProjectMatchResult(BaseModel):
    """Match result for a single project."""
    project_id: str = Field(..., description="Project identifier")
    title: str = Field(..., description="Project title/name")
    match_score: float = Field(..., ge=0, le=100, description="Normalized match score (0-100)")
    match_level: str = Field(..., description="Match category: 'Strong Match', 'Good Match', or 'Skill Gap Match'")
    matched_skills: List[str] = Field(default_factory=list, description="Skills that matched (required + optional)")
    missing_skills: List[str] = Field(default_factory=list, description="Required skills that are missing")
    explanation: str = Field(..., description="Human-readable explanation of the match")


# Difficulty level to minimum experience mapping
DIFFICULTY_EXPERIENCE_MAP = {
    'Beginner': 0,
    'Intermediate': 2,
    'Advanced': 5,
}


def normalize_skill_name(skill: str) -> str:
    """
    Normalize skill name for comparison (case-insensitive, trimmed).
    
    Args:
        skill (str): Skill name
        
    Returns:
        str: Normalized skill name
    """
    return skill.strip().lower()


def check_skill_in_list(skill: str, skill_list: List[str]) -> bool:
    """
    Check if a skill exists in a list (case-insensitive).
    
    Args:
        skill (str): Skill to check
        skill_list (List[str]): List of skills
        
    Returns:
        bool: True if skill found
    """
    normalized_skill = normalize_skill_name(skill)
    normalized_list = [normalize_skill_name(s) for s in skill_list]
    return normalized_skill in normalized_list


def check_domain_match(resume_domains: List[str], project_domain: Optional[str]) -> bool:
    """
    Check if project domain matches any resume domain.
    
    Args:
        resume_domains (List[str]): Domains from resume
        project_domain (Optional[str]): Project domain
        
    Returns:
        bool: True if domain matches
    """
    if not resume_domains or not project_domain:
        return False
    
    normalized_resume_domains = [normalize_skill_name(d) for d in resume_domains]
    normalized_project_domain = normalize_skill_name(project_domain)
    
    return normalized_project_domain in normalized_resume_domains


def check_experience_level(experience_years: float, difficulty_level: Optional[str]) -> bool:
    """
    Check if employee experience meets project difficulty requirement.
    
    Args:
        experience_years (float): Years of experience
        difficulty_level (Optional[str]): Project difficulty level
        
    Returns:
        bool: True if experience >= required level
    """
    if not difficulty_level:
        return True  # No requirement, consider it met
    
    required_years = DIFFICULTY_EXPERIENCE_MAP.get(difficulty_level, 0)
    return experience_years >= required_years


def calculate_match_score(
    resume_profile: ResumeProfile,
    project: Project
) -> Dict:
    """
    Calculate match score for a project-resume pair.
    
    Scoring:
    - +3 points for each required skill match
    - +1 point for each optional skill match
    - +2 points if domain matches
    - +1 point if experience >= project difficulty level
    
    Args:
        resume_profile (ResumeProfile): Employee resume profile
        project (Project): Project to match against
        
    Returns:
        Dict: Match details including raw score, matched skills, missing skills, etc.
    """
    raw_score = 0
    matched_required_skills = []
    matched_optional_skills = []
    missing_required_skills = []
    
    # Check required skills (worth 3 points each)
    for required_skill in project.required_skills:
        if check_skill_in_list(required_skill, resume_profile.skills):
            matched_required_skills.append(required_skill)
            raw_score += 3
        else:
            missing_required_skills.append(required_skill)
    
    # Check optional skills (worth 1 point each)
    for optional_skill in project.optional_skills:
        if check_skill_in_list(optional_skill, resume_profile.skills):
            matched_optional_skills.append(optional_skill)
            raw_score += 1
    
    # Check domain match (worth 2 points)
    domain_match = check_domain_match(resume_profile.domains, project.domain)
    if domain_match:
        raw_score += 2
    
    # Check experience level (worth 1 point)
    experience_match = check_experience_level(
        resume_profile.experience_years or 0.0,
        project.difficulty_level
    )
    if experience_match:
        raw_score += 1
    
    # Normalize score to 0-100
    # Maximum possible score: (3 * num_required_skills) + (1 * num_optional_skills) + 2 + 1
    max_possible_score = (3 * len(project.required_skills)) + len(project.optional_skills) + 3
    
    if max_possible_score == 0:
        normalized_score = 0.0
    else:
        normalized_score = min(100.0, (raw_score / max_possible_score) * 100)
    
    # Determine match level
    if normalized_score >= 70:
        match_level = "Strong Match"
    elif normalized_score >= 40:
        match_level = "Good Match"
    else:
        match_level = "Skill Gap Match"
    
    # Generate explanation
    explanation_parts = []
    if matched_required_skills:
        explanation_parts.append(f"Matched {len(matched_required_skills)} required skill(s): {', '.join(matched_required_skills)}")
    if matched_optional_skills:
        explanation_parts.append(f"Matched {len(matched_optional_skills)} optional skill(s): {', '.join(matched_optional_skills)}")
    if domain_match:
        explanation_parts.append("Domain alignment detected")
    if experience_match:
        explanation_parts.append("Experience level sufficient")
    if missing_required_skills:
        explanation_parts.append(f"Missing {len(missing_required_skills)} required skill(s): {', '.join(missing_required_skills)}")
    
    explanation = ". ".join(explanation_parts) if explanation_parts else "No significant matches found."
    
    return {
        'raw_score': raw_score,
        'normalized_score': round(normalized_score, 2),
        'match_level': match_level,
        'matched_required_skills': matched_required_skills,
        'matched_optional_skills': matched_optional_skills,
        'missing_required_skills': missing_required_skills,
        'domain_match': domain_match,
        'experience_match': experience_match,
        'explanation': explanation
    }


def match_resume_to_projects(
    resume_profile: ResumeProfile,
    projects: List[Project],
    filter_active_only: bool = True
) -> List[ProjectMatchResult]:
    """
    Match a resume profile to a list of projects and return ranked results.
    
    Args:
        resume_profile (ResumeProfile): Employee resume profile
        projects (List[Project]): List of projects to match against
        filter_active_only (bool): Only include active projects (default: True)
        
    Returns:
        List[ProjectMatchResult]: Ranked list of project matches (sorted by score, descending)
    """
    if not projects:
        return []
    
    # Filter to active projects only if requested
    if filter_active_only:
        projects = [p for p in projects if p.active]
    
    # Calculate match score for each project
    matches = []
    for project in projects:
        match_data = calculate_match_score(resume_profile, project)
        
        # Combine matched skills
        all_matched_skills = match_data['matched_required_skills'] + match_data['matched_optional_skills']
        
        match_result = ProjectMatchResult(
            project_id=project.project_id,
            title=project.project_name,
            match_score=match_data['normalized_score'],
            match_level=match_data['match_level'],
            matched_skills=all_matched_skills,
            missing_skills=match_data['missing_required_skills'],
            explanation=match_data['explanation']
        )
        
        matches.append(match_result)
    
    # Sort by match score (descending)
    matches.sort(key=lambda x: x.match_score, reverse=True)
    
    return matches


# Test block
if __name__ == "__main__":
    """
    Test the project matching service.
    
    Usage:
        python backend/services/project_matching_service.py
    """
    from datetime import datetime, timezone
    
    # Sample resume profile
    resume = ResumeProfile(
        employee_id="emp123",
        skills=["Python", "React", "SQL", "AWS", "Docker"],
        experience_years=5.0,
        domains=["Full Stack", "Backend"],
        text_length=5000,
        file_type="PDF"
    )
    
    # Sample projects
    projects = [
        Project(
            project_id="proj1",
            project_name="E-commerce Platform",
            required_skills=["Python", "React", "SQL"],
            optional_skills=["AWS", "Docker"],
            domain="Full Stack",
            difficulty_level="Intermediate",
            active=True,
            description="Build a modern e-commerce platform"
        ),
        Project(
            project_id="proj2",
            project_name="ML Data Pipeline",
            required_skills=["Python", "Machine Learning"],
            optional_skills=["AWS", "Docker"],
            domain="Data Science",
            difficulty_level="Advanced",
            active=True,
            description="Build ML pipeline for data processing"
        ),
        Project(
            project_id="proj3",
            project_name="Mobile App",
            required_skills=["React Native", "JavaScript"],
            optional_skills=["AWS"],
            domain="Mobile",
            difficulty_level="Beginner",
            active=True,
            description="Build a mobile application"
        ),
    ]
    
    print("=" * 70)
    print("Project Matching Service - Test")
    print("=" * 70)
    print(f"\nResume Profile:")
    print(f"  Skills: {', '.join(resume.skills)}")
    print(f"  Experience: {resume.experience_years} years")
    print(f"  Domains: {', '.join(resume.domains)}")
    
    print(f"\nProjects to Match:")
    for proj in projects:
        print(f"  - {proj.project_name}: {', '.join(proj.required_skills)}")
    
    print("\n" + "-" * 70)
    print("Match Results:")
    print("-" * 70)
    
    # Match resume to projects
    matches = match_resume_to_projects(resume, projects)
    
    for i, match in enumerate(matches, 1):
        print(f"\n{i}. {match.title} ({match.match_level})")
        print(f"   Score: {match.match_score}/100")
        print(f"   Matched Skills: {', '.join(match.matched_skills) if match.matched_skills else 'None'}")
        print(f"   Missing Skills: {', '.join(match.missing_skills) if match.missing_skills else 'None'}")
        print(f"   Explanation: {match.explanation}")
    
    print("\n" + "=" * 70)

