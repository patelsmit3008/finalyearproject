"""
Module 4F: Helix Points Engine for Helix AI

This module awards Helix Points fairly and transparently based on
validated skill growth and project contributions.

Key Rules:
- Points awarded ONLY after contribution is validated AND confidence is updated
- Points are incremental, non-decreasing, and fully auditable
- Resume-based confidence does NOT award points
- Rejected/pending contributions award ZERO points

Dependencies:
    - project_contributions.py (Module 4C) - for contribution structure
    - skill_confidence_updater.py (Module 4E) - for confidence update structure

Author: Helix AI System
"""

from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone
import json


# Configuration constants
BASE_POINTS_MINOR = 10
BASE_POINTS_MODERATE = 25
BASE_POINTS_SIGNIFICANT = 50

# Role multipliers
ROLE_MULTIPLIER_ASSISTANT = 0.7
ROLE_MULTIPLIER_CONTRIBUTOR = 1.0
ROLE_MULTIPLIER_LEAD = 1.3

# Confidence delta multipliers (bonus for larger confidence gains)
CONFIDENCE_DELTA_MULTIPLIER_THRESHOLD = 5.0  # Points multiplier kicks in above this
CONFIDENCE_DELTA_MULTIPLIER_FACTOR = 1.1  # 10% bonus per 5% confidence gain

# Per-skill monthly cap (anti-gaming)
MONTHLY_POINTS_CAP_PER_SKILL = 200

# Per-contribution minimum/maximum
MIN_POINTS_PER_CONTRIBUTION = 5
MAX_POINTS_PER_CONTRIBUTION = 150


def calculate_base_points(contribution_level: str) -> int:
    """
    Calculate base points based on contribution level.
    
    Args:
        contribution_level (str): 'Minor', 'Moderate', 'Significant'
        
    Returns:
        int: Base points for the contribution level
    """
    base_points_map = {
        'Minor': BASE_POINTS_MINOR,
        'Moderate': BASE_POINTS_MODERATE,
        'Significant': BASE_POINTS_SIGNIFICANT,
    }
    
    return base_points_map.get(contribution_level, BASE_POINTS_MODERATE)


def get_role_multiplier(role: str) -> float:
    """
    Get role multiplier for point calculation.
    
    Args:
        role (str): 'Assistant', 'Contributor', 'Lead', 'Architect'
        
    Returns:
        float: Role multiplier
    """
    role_multipliers = {
        'Assistant': ROLE_MULTIPLIER_ASSISTANT,
        'Contributor': ROLE_MULTIPLIER_CONTRIBUTOR,
        'Lead': ROLE_MULTIPLIER_LEAD,
        'Architect': ROLE_MULTIPLIER_LEAD * 1.1,  # Slightly higher than Lead
    }
    
    return role_multipliers.get(role, ROLE_MULTIPLIER_CONTRIBUTOR)


def calculate_confidence_delta_multiplier(confidence_delta: float) -> float:
    """
    Calculate multiplier based on confidence gain.
    
    Larger confidence gains receive a bonus multiplier.
    
    Args:
        confidence_delta (float): Change in confidence percentage
        
    Returns:
        float: Confidence delta multiplier
    """
    if confidence_delta <= 0:
        return 1.0
    
    # Bonus multiplier for larger confidence gains
    if confidence_delta >= CONFIDENCE_DELTA_MULTIPLIER_THRESHOLD:
        bonus_factor = (confidence_delta / CONFIDENCE_DELTA_MULTIPLIER_THRESHOLD) * CONFIDENCE_DELTA_MULTIPLIER_FACTOR
        return min(bonus_factor, 2.0)  # Cap at 2x
    
    return 1.0


def calculate_helix_points(
    contribution_level: str,
    role: str,
    confidence_delta: float = 0.0,
    skill_rarity_multiplier: float = 1.0
) -> int:
    """
    Calculate Helix Points for a validated contribution with applied confidence update.
    
    Formula:
        base_points = f(contribution_level)
        role_multiplier = f(role)
        confidence_multiplier = f(confidence_delta)
        total_points = base_points * role_multiplier * confidence_multiplier * skill_rarity_multiplier
        Apply min/max bounds
    
    Args:
        contribution_level (str): 'Minor', 'Moderate', 'Significant'
        role (str): 'Assistant', 'Contributor', 'Lead', 'Architect'
        confidence_delta (float): Change in confidence (from Module 4E)
        skill_rarity_multiplier (float): Optional multiplier for rare skills (default: 1.0)
        
    Returns:
        int: Calculated Helix Points
    """
    # Base points from contribution level
    base_points = calculate_base_points(contribution_level)
    
    # Role multiplier
    role_mult = get_role_multiplier(role)
    
    # Confidence delta multiplier
    confidence_mult = calculate_confidence_delta_multiplier(confidence_delta)
    
    # Calculate total points
    total_points = base_points * role_mult * confidence_mult * skill_rarity_multiplier
    
    # Round to integer
    total_points = int(round(total_points))
    
    # Apply min/max bounds
    total_points = max(MIN_POINTS_PER_CONTRIBUTION, min(total_points, MAX_POINTS_PER_CONTRIBUTION))
    
    return total_points


def process_point_awards(
    validated_contributions: List[Dict],
    confidence_updates: List[Dict],
    current_monthly_points: Dict[str, int] = None
) -> Dict:
    """
    Process point awards for validated contributions with applied confidence updates.
    
    This function:
        1. Matches contributions with their confidence updates
        2. Calculates points for each match
        3. Applies monthly caps per skill
        4. Returns award plan (not applied yet)
    
    Args:
        validated_contributions (List[Dict]): Validated contribution records
        confidence_updates (List[Dict]): Applied confidence updates from Module 4E
        current_monthly_points (Dict[str, int]): Points already awarded this month per skill
        
    Returns:
        Dict: Award plan with structure:
            {
                'awards': [
                    {
                        'employeeId': str,
                        'skill': str,
                        'pointsAwarded': int,
                        'sourceContributionId': str,
                        'contributionLevel': str,
                        'role': str,
                        'confidenceDelta': float,
                        'basePoints': int,
                        'roleMultiplier': float,
                        'confidenceMultiplier': float
                    }
                ],
                'totalPoints': int,
                'errors': List[str]
            }
    """
    if current_monthly_points is None:
        current_monthly_points = {}
    
    # Create lookup map: contribution_id -> confidence_update
    confidence_update_map = {}
    for update in confidence_updates:
        contrib_id = update.get('sourceContributionId')
        if contrib_id:
            confidence_update_map[contrib_id] = update
    
    # Process each validated contribution
    awards = []
    errors = []
    total_points = 0
    
    for contrib in validated_contributions:
        try:
            contrib_id = contrib.get('id')
            employee_id = contrib.get('employeeId')
            skill = contrib.get('skill')
            contribution_level = contrib.get('contributionLevel', 'Moderate')
            role = contrib.get('role', 'Contributor')
            
            # Check if contribution has been applied to confidence
            if not contrib.get('appliedToConfidence'):
                errors.append(f"Contribution {contrib_id} not yet applied to confidence")
                continue
            
            # Find matching confidence update
            confidence_update = confidence_update_map.get(contrib_id)
            if not confidence_update:
                errors.append(f"No confidence update found for contribution {contrib_id}")
                continue
            
            # Get confidence delta
            confidence_delta = confidence_update.get('increment', 0.0)
            
            # Check monthly cap
            skill_points_this_month = current_monthly_points.get(skill, 0)
            if skill_points_this_month >= MONTHLY_POINTS_CAP_PER_SKILL:
                errors.append(f"Monthly cap reached for skill {skill} (contribution {contrib_id})")
                continue
            
            # Calculate points
            base_points = calculate_base_points(contribution_level)
            role_mult = get_role_multiplier(role)
            confidence_mult = calculate_confidence_delta_multiplier(confidence_delta)
            calculated_points = calculate_helix_points(
                contribution_level=contribution_level,
                role=role,
                confidence_delta=confidence_delta,
                skill_rarity_multiplier=1.0  # Can be extended later
            )
            
            # Check if points would exceed monthly cap
            if skill_points_this_month + calculated_points > MONTHLY_POINTS_CAP_PER_SKILL:
                calculated_points = MONTHLY_POINTS_CAP_PER_SKILL - skill_points_this_month
                if calculated_points < MIN_POINTS_PER_CONTRIBUTION:
                    errors.append(f"Points would exceed monthly cap for skill {skill}")
                    continue
            
            # Create award record
            award = {
                'employeeId': employee_id,
                'skill': skill,
                'pointsAwarded': calculated_points,
                'sourceContributionId': contrib_id,
                'contributionLevel': contribution_level,
                'role': role,
                'confidenceDelta': confidence_delta,
                'basePoints': base_points,
                'roleMultiplier': role_mult,
                'confidenceMultiplier': confidence_mult,
            }
            
            awards.append(award)
            total_points += calculated_points
            
        except Exception as e:
            errors.append(f"Error processing contribution {contrib.get('id', 'unknown')}: {str(e)}")
    
    return {
        'awards': awards,
        'totalPoints': total_points,
        'errors': errors
    }


def validate_award_plan(award_plan: Dict) -> Tuple[bool, List[str]]:
    """
    Validate an award plan before applying it.
    
    Args:
        award_plan (Dict): Award plan from process_point_awards
        
    Returns:
        Tuple[bool, List[str]]: (is_valid, error_messages)
    """
    errors = []
    
    # Check structure
    if 'awards' not in award_plan:
        errors.append("Award plan missing 'awards' field")
        return False, errors
    
    # Validate each award
    for award in award_plan['awards']:
        employee_id = award.get('employeeId')
        skill = award.get('skill')
        points = award.get('pointsAwarded')
        contrib_id = award.get('sourceContributionId')
        
        # Check required fields
        if not employee_id:
            errors.append("Award missing 'employeeId'")
        if not skill:
            errors.append("Award missing 'skill'")
        if points is None:
            errors.append(f"Award missing 'pointsAwarded'")
        if not contrib_id:
            errors.append(f"Award missing 'sourceContributionId'")
        
        # Validate points bounds
        if points is not None:
            if points < MIN_POINTS_PER_CONTRIBUTION:
                errors.append(f"Invalid points for {skill}: {points} (minimum: {MIN_POINTS_PER_CONTRIBUTION})")
            if points > MAX_POINTS_PER_CONTRIBUTION:
                errors.append(f"Invalid points for {skill}: {points} (maximum: {MAX_POINTS_PER_CONTRIBUTION})")
    
    return len(errors) == 0, errors


# Test block
if __name__ == "__main__":
    """
    Test the Helix Points Engine.
    
    Usage:
        python helix_points_engine.py
    """
    print("=" * 70)
    print("Helix Points Engine - Module 4F")
    print("=" * 70)
    
    # Mock validated contributions (with appliedToConfidence = true)
    validated_contributions = [
        {
            'id': 'contrib_001',
            'employeeId': 'emp_001',
            'skill': 'React',
            'contributionLevel': 'Moderate',
            'role': 'Contributor',
            'appliedToConfidence': True,
        },
        {
            'id': 'contrib_002',
            'employeeId': 'emp_001',
            'skill': 'React',
            'contributionLevel': 'Significant',
            'role': 'Lead',
            'appliedToConfidence': True,
        },
        {
            'id': 'contrib_003',
            'employeeId': 'emp_001',
            'skill': 'Node.js',
            'contributionLevel': 'Moderate',
            'role': 'Contributor',
            'appliedToConfidence': True,
        },
    ]
    
    # Mock confidence updates (from Module 4E)
    confidence_updates = [
        {
            'sourceContributionId': 'contrib_001',
            'skill': 'React',
            'increment': 5.0,
        },
        {
            'sourceContributionId': 'contrib_002',
            'skill': 'React',
            'increment': 8.8,
        },
        {
            'sourceContributionId': 'contrib_003',
            'skill': 'Node.js',
            'increment': 5.0,
        },
    ]
    
    print("\nValidated Contributions:")
    print("-" * 70)
    for contrib in validated_contributions:
        print(f"  {contrib['id']}: {contrib['skill']} - {contrib['contributionLevel']} ({contrib['role']})")
    
    print("\nConfidence Updates:")
    print("-" * 70)
    for update in confidence_updates:
        print(f"  {update['sourceContributionId']}: {update['skill']} +{update['increment']}%")
    
    # Process point awards
    print("\n" + "=" * 70)
    print("Processing Point Awards...")
    print("=" * 70)
    
    award_plan = process_point_awards(
        validated_contributions=validated_contributions,
        confidence_updates=confidence_updates,
        current_monthly_points={}
    )
    
    # Validate plan
    is_valid, errors = validate_award_plan(award_plan)
    
    if is_valid:
        print("\n✓ Award plan is valid")
    else:
        print("\n✗ Award plan has errors:")
        for error in errors:
            print(f"  - {error}")
    
    print("\nAward Plan:")
    print("-" * 70)
    print(json.dumps(award_plan, indent=2))
    
    # Display summary
    print("\n" + "=" * 70)
    print("Point Awards Summary:")
    print("=" * 70)
    for award in award_plan['awards']:
        print(f"\n{award['skill']} ({award['contributionLevel']}, {award['role']}):")
        print(f"  Base Points: {award['basePoints']}")
        print(f"  Role Multiplier: {award['roleMultiplier']}x")
        print(f"  Confidence Multiplier: {award['confidenceMultiplier']:.2f}x")
        print(f"  Confidence Delta: +{award['confidenceDelta']}%")
        print(f"  Points Awarded: {award['pointsAwarded']}")
        print(f"  Source: {award['sourceContributionId']}")
    
    print(f"\nTotal Points: {award_plan['totalPoints']}")
    
    print("\n" + "=" * 70)
    print("✓ Module 4F test complete")
    print("=" * 70)

