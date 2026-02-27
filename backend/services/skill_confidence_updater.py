"""
Skill Confidence Updater Service for Helix AI

This module updates skill confidence based on project contributions.
It provides pure computation logic with no database writes or UI dependencies.

Key Rules:
- Increases confidence of used skills by +2% per contribution
- Caps confidence at 100%
- Adds new skills learned during project (starts at 40%)
- Pure Python computation only
- No database writes
- No UI logic

Input: ResumeProfile + ProjectContribution
Output: Updated skill confidence mapping (skill -> confidence %)

Author: Helix AI System
"""

from typing import Dict, List, Optional
from models.core_models import ResumeProfile, ProjectContribution


# Configuration constants
CONFIDENCE_INCREMENT_PER_CONTRIBUTION = 2  # +2% per contribution
NEW_SKILL_STARTING_CONFIDENCE = 40  # 40% for newly learned skills
MAX_CONFIDENCE = 100  # Maximum confidence cap
MIN_CONFIDENCE = 0  # Minimum confidence


def normalize_skill_name(skill: str) -> str:
    """
    Normalize skill name for comparison (case-insensitive, trimmed).
    
    Args:
        skill (str): Skill name
        
    Returns:
        str: Normalized skill name
    """
    return skill.strip().lower()


def find_skill_in_list(skill: str, skill_list: list) -> Optional[str]:
    """
    Find a skill in a list using case-insensitive matching.
    
    Args:
        skill (str): Skill to find
        skill_list (list): List of skills to search
        
    Returns:
        Optional[str]: Matching skill from list (original case), or None if not found
    """
    normalized_target = normalize_skill_name(skill)
    for existing_skill in skill_list:
        if normalize_skill_name(existing_skill) == normalized_target:
            return existing_skill
    return None


def update_skill_confidence(
    resume_profile: ResumeProfile,
    contribution: ProjectContribution,
    current_confidence: Optional[Dict[str, int]] = None
) -> Dict[str, int]:
    """
    Update skill confidence based on a project contribution.
    
    This function:
    1. Checks if the skill used in the contribution exists in resume
    2. If skill exists: increases confidence by +2%
    3. If skill doesn't exist: adds it with 40% confidence
    4. Caps all confidence values at 100%
    
    Args:
        resume_profile (ResumeProfile): Employee resume profile with current skills
        contribution (ProjectContribution): Validated project contribution
        current_confidence (Optional[Dict[str, int]]): Current skill confidence mapping (skill -> %)
            If None, initializes all resume skills at 0%
        
    Returns:
        Dict[str, int]: Updated skill confidence mapping (skill -> confidence %)
        Keys are skill names (preserving original case from resume or contribution)
        Values are confidence percentages (0-100)
    """
    # Initialize confidence dict
    if current_confidence is None:
        # Start fresh: initialize all resume skills at 0%
        skill_confidence: Dict[str, int] = {}
        for skill in resume_profile.skills:
            skill_confidence[skill] = 0
    else:
        # Use existing confidence as starting point
        skill_confidence = current_confidence.copy()
    
    # Get the skill used in the contribution
    skill_used = contribution.skill_used
    
    # Check if skill exists in resume (case-insensitive)
    existing_skill = find_skill_in_list(skill_used, resume_profile.skills)
    
    if existing_skill:
        # Skill exists in resume - increase confidence
        current_conf = skill_confidence.get(existing_skill, 0)
        new_confidence = min(
            current_conf + CONFIDENCE_INCREMENT_PER_CONTRIBUTION,
            MAX_CONFIDENCE
        )
        skill_confidence[existing_skill] = new_confidence
    else:
        # Skill doesn't exist in resume - it's a newly learned skill
        # Check if it was already added from a previous contribution
        if skill_used in skill_confidence:
            # Increment existing new skill
            current_conf = skill_confidence[skill_used]
            new_confidence = min(
                current_conf + CONFIDENCE_INCREMENT_PER_CONTRIBUTION,
                MAX_CONFIDENCE
            )
            skill_confidence[skill_used] = new_confidence
        else:
            # First time seeing this skill - add with starting confidence of 40%
            skill_confidence[skill_used] = NEW_SKILL_STARTING_CONFIDENCE
    
    return skill_confidence


def update_skill_confidence_batch(
    resume_profile: ResumeProfile,
    contributions: List[ProjectContribution],
    current_confidence: Optional[Dict[str, int]] = None
) -> Dict[str, int]:
    """
    Update skill confidence based on multiple project contributions.
    
    Processes contributions sequentially, applying confidence updates for each.
    Skills that appear in multiple contributions get multiple increments.
    
    Args:
        resume_profile (ResumeProfile): Employee resume profile
        contributions (List[ProjectContribution]): List of validated project contributions
        current_confidence (Optional[Dict[str, int]]): Current skill confidence mapping (skill -> %)
            If None, initializes all resume skills at 0%
        
    Returns:
        Dict[str, int]: Updated skill confidence mapping (skill -> confidence %)
    """
    # Initialize confidence dict
    if current_confidence is None:
        # Start fresh: initialize all resume skills at 0%
        skill_confidence: Dict[str, int] = {}
        for skill in resume_profile.skills:
            skill_confidence[skill] = 0
    else:
        # Use existing confidence as starting point
        skill_confidence = current_confidence.copy()
    
    # Process each contribution sequentially
    for contribution in contributions:
        skill_used = contribution.skill_used
        
        # Check if skill exists in resume (case-insensitive)
        existing_skill = find_skill_in_list(skill_used, resume_profile.skills)
        
        if existing_skill:
            # Skill exists in resume - increase confidence
            current_conf = skill_confidence.get(existing_skill, 0)
            new_confidence = min(
                current_conf + CONFIDENCE_INCREMENT_PER_CONTRIBUTION,
                MAX_CONFIDENCE
            )
            skill_confidence[existing_skill] = new_confidence
        else:
            # New skill - add with starting confidence or increment if already added
            if skill_used in skill_confidence:
                # Skill was already added from a previous contribution
                current_conf = skill_confidence[skill_used]
                new_confidence = min(
                    current_conf + CONFIDENCE_INCREMENT_PER_CONTRIBUTION,
                    MAX_CONFIDENCE
                )
                skill_confidence[skill_used] = new_confidence
            else:
                # First time seeing this skill - add with starting confidence
                skill_confidence[skill_used] = NEW_SKILL_STARTING_CONFIDENCE
    
    return skill_confidence


# Test block
if __name__ == "__main__":
    """
    Test the skill confidence updater with sample data.
    
    Usage:
        python backend/services/skill_confidence_updater.py
    """
    from datetime import datetime, timezone
    from models.core_models import ContributionLevel, ContributionRole, ContributionStatus
    
    # Sample resume profile
    resume = ResumeProfile(
        employee_id="emp123",
        skills=["Python", "React", "AWS"],
        experience_years=3.5,
        domains=["Backend", "Cloud"],
        text_length=5000,
        file_type="PDF"
    )
    
    # Sample contributions
    contributions = [
        ProjectContribution(
            employee_id="emp123",
            employee_name="John Doe",
            project_id="proj1",
            project_name="E-commerce Platform",
            skill_used="React",  # Existing skill
            role_in_project=ContributionRole.CONTRIBUTOR,
            contribution_level=ContributionLevel.MODERATE,
            status=ContributionStatus.VALIDATED
        ),
        ProjectContribution(
            employee_id="emp123",
            employee_name="John Doe",
            project_id="proj1",
            project_name="E-commerce Platform",
            skill_used="TypeScript",  # New skill
            role_in_project=ContributionRole.CONTRIBUTOR,
            contribution_level=ContributionLevel.MODERATE,
            status=ContributionStatus.VALIDATED
        ),
        ProjectContribution(
            employee_id="emp123",
            employee_name="John Doe",
            project_id="proj2",
            project_name="Data Dashboard",
            skill_used="Python",  # Existing skill
            role_in_project=ContributionRole.LEAD,
            contribution_level=ContributionLevel.SIGNIFICANT,
            status=ContributionStatus.VALIDATED
        ),
    ]
    
    print("=" * 70)
    print("Skill Confidence Updater - Test")
    print("=" * 70)
    print(f"\nResume Profile:")
    print(f"  Skills: {', '.join(resume.skills)}")
    print(f"\nContributions:")
    for i, contrib in enumerate(contributions, 1):
        print(f"  {i}. {contrib.skill_used} in {contrib.project_name} ({contrib.contribution_level.value})")
    
    print("\n" + "-" * 70)
    print("Updated Skill Confidence:")
    print("-" * 70)
    
    # Update confidence
    updated_confidence = update_skill_confidence_batch(resume, contributions)
    
    for skill, confidence in sorted(updated_confidence.items()):
        print(f"  {skill}: {confidence}%")
    
    print("\n" + "=" * 70)
    print("Explanation:")
    print("=" * 70)
    print("  - Existing skills (Python, React, AWS) start at 0%")
    print(f"  - React: +{CONFIDENCE_INCREMENT_PER_CONTRIBUTION}% (1 contribution) = {updated_confidence.get('React', 0)}%")
    print(f"  - Python: +{CONFIDENCE_INCREMENT_PER_CONTRIBUTION}% (1 contribution) = {updated_confidence.get('Python', 0)}%")
    print(f"  - TypeScript: New skill, starts at {NEW_SKILL_STARTING_CONFIDENCE}%")
    print(f"  - AWS: No contributions, remains at {updated_confidence.get('AWS', 0)}%")

