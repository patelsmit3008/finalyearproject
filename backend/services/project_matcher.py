"""
Resume-to-Project Matching Engine for Helix AI

This module provides deterministic matching between employee resumes and active projects.
It uses a scoring system to rank projects based on skill matches and domain overlap.

Key Rules:
- Deterministic scoring (no ML, no randomness)
- Pure Python logic only
- No database writes
- Returns top 3 matches with explanations

Scoring:
- +2 points for each required skill match
- +1 point for optional skill match (skills in resume that complement project)
- +1 point if project domain overlaps resume domains

Author: Helix AI System
"""

from typing import List, Dict, Optional
from pydantic import BaseModel, Field
from models.core_models import ResumeProfile, Project


class ProjectMatch(BaseModel):
    """Match result for a single project."""
    project: Project
    match_score: int = Field(..., ge=0, description="Total match score")
    matched_required_skills: List[str] = Field(default_factory=list, description="Required skills that matched")
    matched_optional_skills: List[str] = Field(default_factory=list, description="Optional/complementary skills that matched")
    domain_overlap: bool = Field(False, description="Whether project domain overlaps resume domains")
    explanation: str = Field(..., description="Human-readable explanation of the match")


def normalize_skill_name(skill: str) -> str:
    """
    Normalize skill name for comparison (case-insensitive, trimmed).
    
    Args:
        skill (str): Skill name
        
    Returns:
        str: Normalized skill name
    """
    return skill.strip().lower()


def check_skill_match(resume_skills: List[str], project_skill: str) -> bool:
    """
    Check if a project skill matches any resume skill (case-insensitive).
    
    Args:
        resume_skills (List[str]): Skills from resume
        project_skill (str): Skill required by project
        
    Returns:
        bool: True if match found
    """
    normalized_project_skill = normalize_skill_name(project_skill)
    normalized_resume_skills = [normalize_skill_name(s) for s in resume_skills]
    return normalized_project_skill in normalized_resume_skills


def check_domain_overlap(resume_domains: List[str], project_description: Optional[str]) -> bool:
    """
    Check if project description contains keywords from resume domains.
    
    Args:
        resume_domains (List[str]): Domains from resume (e.g., 'Frontend', 'Backend')
        project_description (Optional[str]): Project description
        
    Returns:
        bool: True if domain overlap detected
    """
    if not resume_domains or not project_description:
        return False
    
    # Normalize domains and description for comparison
    normalized_domains = [normalize_skill_name(d) for d in resume_domains]
    normalized_description = normalize_skill_name(project_description)
    
    # Check if any domain keyword appears in description
    for domain in normalized_domains:
        if domain in normalized_description:
            return True
    
    # Also check for common domain synonyms
    domain_synonyms = {
        'frontend': ['front-end', 'front end', 'ui', 'user interface', 'client-side', 'react', 'vue', 'angular'],
        'backend': ['back-end', 'back end', 'server', 'api', 'server-side', 'node', 'django', 'flask'],
        'fullstack': ['full-stack', 'full stack', 'fullstack'],
        'mobile': ['ios', 'android', 'react native', 'flutter', 'swift', 'kotlin'],
        'cloud': ['aws', 'azure', 'gcp', 'cloud', 'devops', 'infrastructure'],
        'data': ['data science', 'machine learning', 'ml', 'ai', 'analytics', 'big data'],
    }
    
    for domain in normalized_domains:
        synonyms = domain_synonyms.get(domain, [])
        for synonym in synonyms:
            if synonym in normalized_description:
                return True
    
    return False


def find_optional_skill_matches(resume_skills: List[str], project_required_skills: List[str]) -> List[str]:
    """
    Find skills in resume that complement the project but aren't required.
    
    These are skills that could be useful for the project but aren't mandatory.
    We identify complementary skills by checking for common skill combinations.
    
    Args:
        resume_skills (List[str]): Skills from resume
        project_required_skills (List[str]): Required skills for project
        
    Returns:
        List[str]: List of complementary skills found
    """
    # Normalize all skills
    normalized_resume = [normalize_skill_name(s) for s in resume_skills]
    normalized_required = [normalize_skill_name(s) for s in project_required_skills]
    
    # Find skills in resume that aren't required but might be complementary
    complementary_skills = []
    
    # Common complementary skill groups
    skill_groups = {
        'frontend': ['html', 'css', 'javascript', 'react', 'vue', 'angular', 'typescript', 'tailwind', 'bootstrap'],
        'backend': ['python', 'node.js', 'java', 'spring', 'django', 'flask', 'fastapi', 'express'],
        'database': ['sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'firebase'],
        'cloud': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform'],
        'testing': ['jest', 'pytest', 'cypress', 'selenium', 'junit'],
        'devops': ['ci/cd', 'jenkins', 'github actions', 'gitlab', 'docker', 'kubernetes'],
    }
    
    # Check if project has skills from a group, then look for other skills from same group
    for group_name, group_skills in skill_groups.items():
        # Check if any required skill is in this group
        has_group_required = any(normalize_skill_name(rs) in group_skills for rs in project_required_skills)
        
        if has_group_required:
            # Find resume skills in the same group that aren't required
            for resume_skill in resume_skills:
                normalized_resume_skill = normalize_skill_name(resume_skill)
                if normalized_resume_skill in group_skills and normalized_resume_skill not in normalized_required:
                    if resume_skill not in complementary_skills:
                        complementary_skills.append(resume_skill)
    
    return complementary_skills


def calculate_match_score(
    resume_profile: ResumeProfile,
    project: Project
) -> Dict:
    """
    Calculate match score between a resume profile and a project.
    
    Scoring:
    - +2 points for each required skill match
    - +1 point for each optional/complementary skill match
    - +1 point if project domain overlaps resume domains
    
    Args:
        resume_profile (ResumeProfile): Employee resume profile
        project (Project): Project to match against
        
    Returns:
        Dict: Match result with score, matched skills, and explanation
    """
    score = 0
    matched_required_skills = []
    matched_optional_skills = []
    domain_overlap = False
    
    # Check required skill matches (+2 points each)
    for required_skill in project.required_skills:
        if check_skill_match(resume_profile.skills, required_skill):
            score += 2
            matched_required_skills.append(required_skill)
    
    # Find optional/complementary skill matches (+1 point each)
    optional_skills = find_optional_skill_matches(resume_profile.skills, project.required_skills)
    for optional_skill in optional_skills:
        score += 1
        matched_optional_skills.append(optional_skill)
    
    # Check domain overlap (+1 point)
    if check_domain_overlap(resume_profile.domains, project.description):
        score += 1
        domain_overlap = True
    
    # Generate explanation
    explanation_parts = []
    
    if matched_required_skills:
        skill_list = ', '.join(matched_required_skills)
        count = len(matched_required_skills)
        explanation_parts.append(f"Matched {count} required skill{'s' if count > 1 else ''}: {skill_list}")
    
    if matched_optional_skills:
        skill_list = ', '.join(matched_optional_skills[:3])  # Limit to 3 for brevity
        count = len(matched_optional_skills)
        explanation_parts.append(f"Has {count} complementary skill{'s' if count > 1 else ''}: {skill_list}")
    
    if domain_overlap:
        explanation_parts.append("Domain expertise aligns with project")
    
    if not explanation_parts:
        explanation_parts.append("Limited match - consider skill development")
    
    explanation = ". ".join(explanation_parts) + "."
    
    return {
        'match_score': score,
        'matched_required_skills': matched_required_skills,
        'matched_optional_skills': matched_optional_skills,
        'domain_overlap': domain_overlap,
        'explanation': explanation
    }


def match_resume_to_projects(
    resume_profile: ResumeProfile,
    projects: List[Project],
    top_n: int = 3
) -> List[ProjectMatch]:
    """
    Match a resume profile to active projects and return top N recommendations.
    
    This function:
    1. Scores each project based on skill matches and domain overlap
    2. Ranks projects by match score (descending)
    3. Returns top N projects with match details
    
    Args:
        resume_profile (ResumeProfile): Employee resume profile
        projects (List[Project]): List of active projects to match against
        top_n (int): Number of top matches to return (default: 3)
        
    Returns:
        List[ProjectMatch]: Top N project matches, sorted by score (descending)
    """
    if not projects:
        return []
    
    # Calculate match score for each project
    matches = []
    for project in projects:
        match_data = calculate_match_score(resume_profile, project)
        
        match = ProjectMatch(
            project=project,
            match_score=match_data['match_score'],
            matched_required_skills=match_data['matched_required_skills'],
            matched_optional_skills=match_data['matched_optional_skills'],
            domain_overlap=match_data['domain_overlap'],
            explanation=match_data['explanation']
        )
        matches.append(match)
    
    # Sort by match score (descending), then by project name for consistency
    matches.sort(key=lambda m: (-m.match_score, m.project.project_name))
    
    # Return top N
    return matches[:top_n]


# Test block
if __name__ == "__main__":
    """
    Test the project matcher with sample data.
    
    Usage:
        python backend/services/project_matcher.py
    """
    from datetime import datetime, timezone
    from models.core_models import ProjectStatus
    
    # Sample resume profile
    resume = ResumeProfile(
        employee_id="emp123",
        skills=["Python", "React", "AWS", "Docker", "PostgreSQL"],
        experience_years=3.5,
        domains=["Backend", "Cloud"],
        text_length=5000,
        file_type="PDF"
    )
    
    # Sample projects
    projects = [
        Project(
            project_id="proj1",
            project_name="E-commerce Platform",
            required_skills=["React", "Node.js", "AWS"],
            minimum_helix_score=60,
            status=ProjectStatus.IN_PROGRESS,
            description="Full-stack e-commerce platform with React frontend and Node.js backend, deployed on AWS"
        ),
        Project(
            project_id="proj2",
            project_name="Data Analytics Dashboard",
            required_skills=["Python", "PostgreSQL", "Tableau"],
            minimum_helix_score=50,
            status=ProjectStatus.PLANNING,
            description="Python-based analytics dashboard with PostgreSQL database"
        ),
        Project(
            project_id="proj3",
            project_name="Mobile App",
            required_skills=["React Native", "Firebase"],
            minimum_helix_score=70,
            status=ProjectStatus.IN_PROGRESS,
            description="Cross-platform mobile app using React Native"
        ),
    ]
    
    # Match resume to projects
    print("=" * 70)
    print("Resume-to-Project Matching Engine - Test")
    print("=" * 70)
    print(f"\nResume Profile:")
    print(f"  Skills: {', '.join(resume.skills)}")
    print(f"  Domains: {', '.join(resume.domains)}")
    print(f"  Experience: {resume.experience_years} years")
    print("\n" + "-" * 70)
    print("Matching Results (Top 3):")
    print("-" * 70)
    
    matches = match_resume_to_projects(resume, projects, top_n=3)
    
    for i, match in enumerate(matches, 1):
        print(f"\n{i}. {match.project.project_name}")
        print(f"   Match Score: {match.match_score}")
        print(f"   Required Skills Matched: {len(match.matched_required_skills)}/{len(match.project.required_skills)}")
        if match.matched_required_skills:
            print(f"     - {', '.join(match.matched_required_skills)}")
        if match.matched_optional_skills:
            print(f"   Complementary Skills: {len(match.matched_optional_skills)}")
            print(f"     - {', '.join(match.matched_optional_skills[:3])}")
        print(f"   Domain Overlap: {'Yes' if match.domain_overlap else 'No'}")
        print(f"   Explanation: {match.explanation}")

