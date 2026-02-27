"""
Employee Progress Computation Engine for Helix AI

This module computes comprehensive employee progress metrics based on:
- Resume profile (baseline skills)
- Project contributions (skill usage and growth)

Key Metrics Computed:
- Active projects count
- Total contributions
- Skill growth (confidence deltas)
- Promotion readiness score (average of top 5 skills)
- Recommended next skills (lowest confidence skills < 70%)

Pure computation logic with no database writes or UI dependencies.

Input: ResumeProfile + List[ProjectContribution]
Output: EmployeeProgress object

Author: Helix AI System
"""

from typing import Dict, List, Optional
from datetime import datetime, timezone
from models.core_models import (
    ResumeProfile,
    ProjectContribution,
    EmployeeProgress,
    PromotionReadiness,
    ContributionStatus
)
from services.skill_confidence_updater import (
    update_skill_confidence_batch,
    normalize_skill_name
)


# Configuration constants
PROMOTION_READINESS_TOP_SKILLS_COUNT = 5  # Number of top skills to average
RECOMMENDED_SKILL_THRESHOLD = 70  # Skills below 70% are recommended for improvement
SKILL_GROWTH_DELTA_THRESHOLD = 0  # Minimum delta to consider as growth


def get_initial_skill_confidence(resume_profile: ResumeProfile) -> Dict[str, int]:
    """
    Get initial skill confidence from resume profile.
    
    All resume skills start at 0% confidence (baseline).
    
    Args:
        resume_profile (ResumeProfile): Employee resume profile
        
    Returns:
        Dict[str, int]: Initial skill confidence mapping (skill -> 0%)
    """
    initial_confidence: Dict[str, int] = {}
    for skill in resume_profile.skills:
        initial_confidence[skill] = 0
    return initial_confidence


def count_active_projects(contributions: List[ProjectContribution]) -> int:
    """
    Count unique active projects from contributions.
    
    A project is considered active if it has at least one contribution.
    
    Args:
        contributions (List[ProjectContribution]): List of project contributions
        
    Returns:
        int: Number of unique active projects
    """
    if not contributions:
        return 0
    
    unique_projects = set()
    for contrib in contributions:
        if contrib.project_id:
            unique_projects.add(contrib.project_id)
    
    return len(unique_projects)


def calculate_skill_growth(
    initial_confidence: Dict[str, int],
    final_confidence: Dict[str, int]
) -> Dict[str, int]:
    """
    Calculate skill growth (confidence deltas).
    
    Computes the difference between final and initial confidence for each skill.
    Only includes skills that have growth (delta > 0).
    
    Args:
        initial_confidence (Dict[str, int]): Initial skill confidence (skill -> %)
        final_confidence (Dict[str, int]): Final skill confidence (skill -> %)
        
    Returns:
        Dict[str, int]: Skill growth mapping (skill -> delta %)
    """
    skill_growth: Dict[str, int] = {}
    
    # Calculate growth for all skills in final confidence
    for skill, final_conf in final_confidence.items():
        initial_conf = initial_confidence.get(skill, 0)
        delta = final_conf - initial_conf
        
        # Only include skills with positive growth
        if delta > SKILL_GROWTH_DELTA_THRESHOLD:
            skill_growth[skill] = delta
    
    return skill_growth


def calculate_promotion_readiness_score(
    skill_confidence: Dict[str, int],
    top_n: int = PROMOTION_READINESS_TOP_SKILLS_COUNT
) -> float:
    """
    Calculate promotion readiness score as average of top N skills.
    
    Args:
        skill_confidence (Dict[str, int]): Skill confidence mapping (skill -> %)
        top_n (int): Number of top skills to average (default: 5)
        
    Returns:
        float: Average confidence of top N skills (0-100)
    """
    if not skill_confidence:
        return 0.0
    
    # Sort skills by confidence (descending)
    sorted_skills = sorted(
        skill_confidence.items(),
        key=lambda x: x[1],
        reverse=True
    )
    
    # Take top N skills
    top_skills = sorted_skills[:top_n]
    
    if not top_skills:
        return 0.0
    
    # Calculate average
    total_confidence = sum(conf for _, conf in top_skills)
    average = total_confidence / len(top_skills)
    
    return round(average, 2)


def get_recommended_next_skills(
    skill_confidence: Dict[str, int],
    threshold: int = RECOMMENDED_SKILL_THRESHOLD
) -> List[str]:
    """
    Get recommended next skills for improvement.
    
    Returns skills with confidence below the threshold, sorted by confidence (ascending).
    
    Args:
        skill_confidence (Dict[str, int]): Skill confidence mapping (skill -> %)
        threshold (int): Confidence threshold (default: 70%)
        
    Returns:
        List[str]: List of recommended skills (lowest confidence first)
    """
    if not skill_confidence:
        return []
    
    # Filter skills below threshold
    below_threshold = [
        (skill, conf) for skill, conf in skill_confidence.items()
        if conf < threshold
    ]
    
    # Sort by confidence (ascending) - lowest first
    below_threshold.sort(key=lambda x: x[1])
    
    # Return only skill names
    return [skill for skill, _ in below_threshold]


def compute_employee_progress(
    resume_profile: ResumeProfile,
    contributions: List[ProjectContribution],
    employee_name: Optional[str] = None
) -> EmployeeProgress:
    """
    Compute comprehensive employee progress metrics.
    
    This function:
    1. Calculates initial skill confidence from resume (all 0%)
    2. Updates confidence based on contributions
    3. Computes skill growth deltas
    4. Calculates promotion readiness score (average of top 5 skills)
    5. Identifies recommended next skills (< 70% confidence)
    6. Counts active projects and total contributions
    
    Args:
        resume_profile (ResumeProfile): Employee resume profile
        contributions (List[ProjectContribution]): List of project contributions
        employee_name (Optional[str]): Employee name (defaults to resume employee_id)
        
    Returns:
        EmployeeProgress: Comprehensive progress metrics
    """
    # Get employee name
    if not employee_name and contributions:
        employee_name = contributions[0].employee_name
    elif not employee_name:
        employee_name = resume_profile.employee_id
    
    # Get initial confidence (all resume skills at 0%)
    initial_confidence = get_initial_skill_confidence(resume_profile)
    
    # Filter to validated contributions only
    validated_contributions = [
        contrib for contrib in contributions
        if contrib.status == ContributionStatus.VALIDATED
    ]
    
    # Update confidence based on validated contributions
    final_confidence = update_skill_confidence_batch(
        resume_profile=resume_profile,
        contributions=validated_contributions,
        current_confidence=initial_confidence
    )
    
    # Calculate skill growth (deltas)
    skill_growth = calculate_skill_growth(initial_confidence, final_confidence)
    
    # Calculate promotion readiness score (average of top 5 skills)
    promotion_readiness_score = calculate_promotion_readiness_score(final_confidence)
    
    # Get recommended next skills (confidence < 70%)
    recommended_next_skills = get_recommended_next_skills(final_confidence)
    
    # Count active projects
    active_projects_count = count_active_projects(contributions)
    
    # Count contributions
    total_contributions = len(contributions)
    validated_contributions_count = len(validated_contributions)
    pending_contributions_count = total_contributions - validated_contributions_count
    
    # Calculate average confidence
    if final_confidence:
        average_confidence = sum(final_confidence.values()) / len(final_confidence)
    else:
        average_confidence = 0.0
    
    # Create promotion readiness object
    promotion_readiness = PromotionReadiness(
        employee_id=resume_profile.employee_id,
        promotion_readiness_score=promotion_readiness_score,
        readiness_level=_get_readiness_level(promotion_readiness_score),
        recommended_next_role=None,  # Can be computed separately
        skill_gaps=recommended_next_skills,
        estimated_time_to_promotion=None,  # Can be computed separately
        average_skill_confidence=round(average_confidence, 2),
        confidence_growth_rate=0.0,  # Can be computed with time series data
        points_accumulation_rate=0.0,  # Can be computed with Helix Points data
        contribution_consistency=0.0,  # Can be computed with contribution history
        skill_diversity=0.0  # Can be computed from skill count
    )
    
    # Create and return EmployeeProgress object
    return EmployeeProgress(
        employee_id=resume_profile.employee_id,
        employee_name=employee_name,
        skill_confidence=final_confidence,
        total_skills=len(final_confidence),
        average_confidence=round(average_confidence, 2),
        total_helix_points=0,  # Can be computed separately with Helix Points engine
        points_by_skill={},  # Can be computed separately
        total_contributions=total_contributions,
        validated_contributions=validated_contributions_count,
        pending_contributions=pending_contributions_count,
        promotion_readiness=promotion_readiness,
        last_updated=datetime.now(timezone.utc)
    )


def _get_readiness_level(score: float) -> str:
    """
    Get readiness level from score.
    
    Args:
        score (float): Promotion readiness score (0-100)
        
    Returns:
        str: Readiness level ("Low", "Medium", "High")
    """
    if score >= 70:
        return "High"
    elif score >= 40:
        return "Medium"
    else:
        return "Low"


def get_progress_summary(
    progress: EmployeeProgress,
    contributions: Optional[List[ProjectContribution]] = None,
    initial_confidence: Optional[Dict[str, int]] = None
) -> Dict:
    """
    Get a simplified summary of employee progress with all requested metrics.
    
    Extracts key metrics for easy consumption, including:
    - activeProjects count
    - totalContributions
    - skillGrowth (confidence deltas)
    - promotionReadinessScore (average of top 5 skills)
    - recommendedNextSkills (lowest confidence skills < 70%)
    
    Args:
        progress (EmployeeProgress): Employee progress object
        contributions (Optional[List[ProjectContribution]]): Contributions list for active projects count
        initial_confidence (Optional[Dict[str, int]]): Initial confidence (defaults to 0% for all skills)
        
    Returns:
        Dict: Summary with key metrics:
            {
                'activeProjects': int,
                'totalContributions': int,
                'skillGrowth': Dict[str, int],  # skill -> delta %
                'promotionReadinessScore': float,
                'recommendedNextSkills': List[str]
            }
    """
    # Calculate skill growth (confidence deltas)
    # If initial_confidence not provided, assume all skills started at 0%
    if initial_confidence is None:
        initial_confidence = {skill: 0 for skill in progress.skill_confidence.keys()}
    
    skill_growth = calculate_skill_growth(initial_confidence, progress.skill_confidence)
    
    # Count active projects
    active_projects = 0
    if contributions:
        active_projects = count_active_projects(contributions)
    
    return {
        'activeProjects': active_projects,
        'totalContributions': progress.total_contributions,
        'skillGrowth': skill_growth,
        'promotionReadinessScore': (
            progress.promotion_readiness.promotion_readiness_score
            if progress.promotion_readiness
            else 0.0
        ),
        'recommendedNextSkills': (
            progress.promotion_readiness.skill_gaps
            if progress.promotion_readiness
            else []
        )
    }


# Test block
if __name__ == "__main__":
    """
    Test the employee progress engine with sample data.
    
    Usage:
        python backend/services/employee_progress_engine.py
    """
    from models.core_models import (
        ContributionLevel,
        ContributionRole,
        ContributionStatus
    )
    
    # Sample resume profile
    resume = ResumeProfile(
        employee_id="emp123",
        employee_name="John Doe",
        skills=["Python", "React", "AWS", "Docker"],
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
            skill_used="React",
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
            skill_used="Python",
            role_in_project=ContributionRole.LEAD,
            contribution_level=ContributionLevel.SIGNIFICANT,
            status=ContributionStatus.VALIDATED
        ),
        ProjectContribution(
            employee_id="emp123",
            employee_name="John Doe",
            project_id="proj2",
            project_name="Data Dashboard",
            skill_used="Python",  # Second contribution for Python
            role_in_project=ContributionRole.LEAD,
            contribution_level=ContributionLevel.SIGNIFICANT,
            status=ContributionStatus.VALIDATED
        ),
        ProjectContribution(
            employee_id="emp123",
            employee_name="John Doe",
            project_id="proj3",
            project_name="Cloud Migration",
            skill_used="AWS",
            role_in_project=ContributionRole.CONTRIBUTOR,
            contribution_level=ContributionLevel.MINOR,
            status=ContributionStatus.PENDING  # Not validated
        ),
    ]
    
    print("=" * 70)
    print("Employee Progress Engine - Test")
    print("=" * 70)
    print(f"\nResume Profile:")
    print(f"  Employee: {resume.employee_id}")
    print(f"  Skills: {', '.join(resume.skills)}")
    print(f"\nContributions: {len(contributions)} total")
    print(f"  Validated: {len([c for c in contributions if c.status == ContributionStatus.VALIDATED])}")
    print(f"  Pending: {len([c for c in contributions if c.status == ContributionStatus.PENDING])}")
    
    print("\n" + "-" * 70)
    print("Computing Employee Progress...")
    print("-" * 70)
    
    # Compute progress
    progress = compute_employee_progress(resume, contributions)
    
    print(f"\n✅ Employee Progress Computed")
    print(f"\nKey Metrics:")
    print(f"  Active Projects: {count_active_projects(contributions)}")
    print(f"  Total Contributions: {progress.total_contributions}")
    print(f"  Validated Contributions: {progress.validated_contributions}")
    print(f"  Pending Contributions: {progress.pending_contributions}")
    
    print(f"\nSkill Confidence:")
    for skill, conf in sorted(progress.skill_confidence.items(), key=lambda x: x[1], reverse=True):
        print(f"  {skill}: {conf}%")
    
    # Calculate skill growth manually for display
    initial_conf = get_initial_skill_confidence(resume)
    skill_growth = calculate_skill_growth(initial_conf, progress.skill_confidence)
    
    print(f"\nSkill Growth (Deltas):")
    if skill_growth:
        for skill, delta in sorted(skill_growth.items(), key=lambda x: x[1], reverse=True):
            print(f"  {skill}: +{delta}%")
    else:
        print("  No growth detected")
    
    print(f"\nPromotion Readiness:")
    if progress.promotion_readiness:
        pr = progress.promotion_readiness
        print(f"  Score: {pr.promotion_readiness_score}%")
        print(f"  Level: {pr.readiness_level}")
        print(f"  Average Skill Confidence: {pr.average_skill_confidence}%")
        print(f"  Recommended Next Skills: {', '.join(pr.skill_gaps) if pr.skill_gaps else 'None'}")
    
    print("\n" + "=" * 70)

