"""
Module 4E: Skill Confidence Updater for Helix AI

This module safely and incrementally updates employee skill confidence
using ONLY validated project contributions.

Key Rules:
- Processes only validated contributions (status === "Validated")
- Applies incremental updates (never decreases confidence)
- Enforces bounds (0-100) and growth caps
- Prevents duplicate application
- Fully auditable

Dependencies:
    - project_contributions.py (Module 4C) - for contribution structure
    - skill_confidence.py (Module 4B) - for baseline confidence structure

Author: Helix AI System
"""

from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone
import json


# Configuration constants
MIN_CONFIDENCE = 0
MAX_CONFIDENCE = 100
MONTHLY_GROWTH_CAP = 15  # Maximum confidence growth per skill per month (%)
DIMINISHING_RETURN_FACTOR = 0.8  # Multiplier for repeated contributions


def calculate_confidence_increment(
    contribution_level: str,
    role: str,
    base_impact: float,
    existing_contributions_count: int = 0
) -> float:
    """
    Calculate confidence increment with diminishing returns.
    
    Formula:
        base_increment = base_impact (from contribution)
        role_multiplier = based on role (Architect > Lead > Contributor > Assistant)
        diminishing_factor = DIMINISHING_RETURN_FACTOR ^ existing_contributions_count
        final_increment = base_increment * role_multiplier * diminishing_factor
    
    Args:
        contribution_level (str): 'Minor', 'Moderate', 'Significant'
        role (str): 'Assistant', 'Contributor', 'Lead', 'Architect'
        base_impact (float): Base confidence impact from contribution
        existing_contributions_count (int): Number of already applied contributions
        
    Returns:
        float: Calculated confidence increment
    """
    # Role multipliers (higher role = higher impact)
    role_multipliers = {
        'Architect': 1.2,
        'Lead': 1.1,
        'Contributor': 1.0,
        'Assistant': 0.8
    }
    
    role_multiplier = role_multipliers.get(role, 1.0)
    
    # Apply diminishing returns for repeated contributions
    diminishing_factor = DIMINISHING_RETURN_FACTOR ** existing_contributions_count
    
    # Calculate final increment
    increment = base_impact * role_multiplier * diminishing_factor
    
    return round(increment, 2)


def apply_confidence_update(
    current_confidence: float,
    increment: float,
    monthly_growth_used: float = 0.0
) -> Tuple[float, float]:
    """
    Apply confidence increment with safeguards.
    
    Safeguards:
        - Never decrease confidence
        - Enforce bounds (0-100)
        - Respect monthly growth cap
        
    Args:
        current_confidence (float): Current skill confidence (0-100)
        increment (float): Confidence increment to apply
        monthly_growth_used (float): Already used growth this month
        
    Returns:
        Tuple[float, float]: (new_confidence, actual_increment_applied)
    """
    # Ensure increment is positive
    if increment <= 0:
        return current_confidence, 0.0
    
    # Calculate available growth capacity
    available_capacity = MONTHLY_GROWTH_CAP - monthly_growth_used
    
    # Cap increment by available capacity
    capped_increment = min(increment, available_capacity)
    
    # Calculate new confidence
    new_confidence = current_confidence + capped_increment
    
    # Enforce bounds
    new_confidence = max(MIN_CONFIDENCE, min(new_confidence, MAX_CONFIDENCE))
    
    # Calculate actual increment applied
    actual_increment = new_confidence - current_confidence
    
    return round(new_confidence, 2), round(actual_increment, 2)


def process_validated_contributions(
    validated_contributions: List[Dict],
    current_skill_confidence: Dict[str, float],
    applied_contributions: List[str] = None,
    monthly_growth_tracker: Dict[str, float] = None
) -> Dict:
    """
    Process validated contributions and calculate confidence updates.
    
    This function:
        1. Filters out already-applied contributions
        2. Groups contributions by skill
        3. Calculates increments with diminishing returns
        4. Applies updates with safeguards
        5. Returns update plan (not applied yet)
    
    Args:
        validated_contributions (List[Dict]): List of validated contribution records
        current_skill_confidence (Dict[str, float]): Current confidence per skill
        applied_contributions (List[str]): IDs of already-applied contributions
        monthly_growth_tracker (Dict[str, float]): Growth used per skill this month
        
    Returns:
        Dict: Update plan with structure:
            {
                'updates': [
                    {
                        'skill': str,
                        'oldConfidence': float,
                        'newConfidence': float,
                        'increment': float,
                        'sourceContributionId': str,
                        'contributionLevel': str,
                        'role': str
                    }
                ],
                'appliedContributionIds': List[str],
                'errors': List[str]
            }
    """
    if applied_contributions is None:
        applied_contributions = []
    
    if monthly_growth_tracker is None:
        monthly_growth_tracker = {}
    
    # Filter out already-applied contributions
    pending_contributions = [
        c for c in validated_contributions
        if c.get('id') not in applied_contributions
        and c.get('status') == 'Validated'
        and c.get('confidenceImpact') is not None
    ]
    
    # Group by skill
    skill_contributions = {}
    for contrib in pending_contributions:
        skill = contrib.get('skill')
        if skill not in skill_contributions:
            skill_contributions[skill] = []
        skill_contributions[skill].append(contrib)
    
    # Process each skill
    updates = []
    applied_ids = []
    errors = []
    
    for skill, contributions in skill_contributions.items():
        # Get current confidence (default to 0 if not set)
        current_conf = current_skill_confidence.get(skill, 0.0)
        
        # Get monthly growth used
        growth_used = monthly_growth_tracker.get(skill, 0.0)
        
        # Count existing contributions for diminishing returns
        existing_count = len([c for c in applied_contributions if c.get('skill') == skill])
        
        # Process contributions for this skill
        for contrib in contributions:
            try:
                contrib_id = contrib.get('id')
                contribution_level = contrib.get('contributionLevel', 'Moderate')
                role = contrib.get('role', 'Contributor')
                base_impact = contrib.get('confidenceImpact', 0.0)
                
                # Calculate increment with diminishing returns
                increment = calculate_confidence_increment(
                    contribution_level=contribution_level,
                    role=role,
                    base_impact=base_impact,
                    existing_contributions_count=existing_count
                )
                
                # Apply update with safeguards
                new_conf, actual_increment = apply_confidence_update(
                    current_confidence=current_conf,
                    increment=increment,
                    monthly_growth_used=growth_used
                )
                
                if actual_increment > 0:
                    # Create update record
                    update_record = {
                        'skill': skill,
                        'oldConfidence': current_conf,
                        'newConfidence': new_conf,
                        'increment': actual_increment,
                        'sourceContributionId': contrib_id,
                        'contributionLevel': contribution_level,
                        'role': role,
                        'baseImpact': base_impact
                    }
                    updates.append(update_record)
                    applied_ids.append(contrib_id)
                    
                    # Update current confidence for next iteration
                    current_conf = new_conf
                    growth_used += actual_increment
                    existing_count += 1
                else:
                    errors.append(f"Contribution {contrib_id}: No increment applied (cap reached or invalid)")
                    
            except Exception as e:
                errors.append(f"Error processing contribution {contrib.get('id', 'unknown')}: {str(e)}")
    
    return {
        'updates': updates,
        'appliedContributionIds': applied_ids,
        'errors': errors
    }


def validate_update_plan(update_plan: Dict) -> Tuple[bool, List[str]]:
    """
    Validate an update plan before applying it.
    
    Args:
        update_plan (Dict): Update plan from process_validated_contributions
        
    Returns:
        Tuple[bool, List[str]]: (is_valid, error_messages)
    """
    errors = []
    
    # Check updates structure
    if 'updates' not in update_plan:
        errors.append("Update plan missing 'updates' field")
        return False, errors
    
    # Validate each update
    for update in update_plan['updates']:
        skill = update.get('skill')
        old_conf = update.get('oldConfidence')
        new_conf = update.get('newConfidence')
        increment = update.get('increment')
        
        # Check required fields
        if not skill:
            errors.append("Update missing 'skill' field")
        if old_conf is None:
            errors.append(f"Update for {skill} missing 'oldConfidence'")
        if new_conf is None:
            errors.append(f"Update for {skill} missing 'newConfidence'")
        if increment is None:
            errors.append(f"Update for {skill} missing 'increment'")
        
        # Validate confidence bounds
        if old_conf is not None and (old_conf < MIN_CONFIDENCE or old_conf > MAX_CONFIDENCE):
            errors.append(f"Invalid oldConfidence for {skill}: {old_conf} (must be {MIN_CONFIDENCE}-{MAX_CONFIDENCE})")
        if new_conf is not None and (new_conf < MIN_CONFIDENCE or new_conf > MAX_CONFIDENCE):
            errors.append(f"Invalid newConfidence for {skill}: {new_conf} (must be {MIN_CONFIDENCE}-{MAX_CONFIDENCE})")
        
        # Validate increment is positive
        if increment is not None and increment < 0:
            errors.append(f"Invalid increment for {skill}: {increment} (must be >= 0)")
        
        # Validate confidence increases
        if old_conf is not None and new_conf is not None and new_conf < old_conf:
            errors.append(f"Confidence decreased for {skill}: {old_conf} -> {new_conf}")
    
    return len(errors) == 0, errors


# Test block
if __name__ == "__main__":
    """
    Test the skill confidence updater.
    
    Usage:
        python skill_confidence_updater.py
    """
    print("=" * 70)
    print("Skill Confidence Updater - Module 4E")
    print("=" * 70)
    
    # Mock current skill confidence (from Module 4B)
    current_confidence = {
        'React': 50.0,
        'Node.js': 45.0,
        'AWS': 40.0
    }
    
    # Mock validated contributions (from Module 4D)
    validated_contributions = [
        {
            'id': 'contrib_001',
            'skill': 'React',
            'contributionLevel': 'Moderate',
            'role': 'Contributor',
            'confidenceImpact': 5.0,
            'status': 'Validated'
        },
        {
            'id': 'contrib_002',
            'skill': 'React',
            'contributionLevel': 'Significant',
            'role': 'Lead',
            'confidenceImpact': 10.0,
            'status': 'Validated'
        },
        {
            'id': 'contrib_003',
            'skill': 'Node.js',
            'contributionLevel': 'Moderate',
            'role': 'Contributor',
            'confidenceImpact': 5.0,
            'status': 'Validated'
        },
        {
            'id': 'contrib_004',
            'skill': 'React',
            'contributionLevel': 'Minor',
            'role': 'Assistant',
            'confidenceImpact': 2.0,
            'status': 'Validated'
        }
    ]
    
    print("\nCurrent Skill Confidence:")
    print("-" * 70)
    for skill, conf in current_confidence.items():
        print(f"  {skill}: {conf}%")
    
    print("\nValidated Contributions:")
    print("-" * 70)
    for contrib in validated_contributions:
        print(f"  {contrib['id']}: {contrib['skill']} - {contrib['contributionLevel']} ({contrib['role']}) - Impact: {contrib['confidenceImpact']}%")
    
    # Process contributions
    print("\n" + "=" * 70)
    print("Processing Validated Contributions...")
    print("=" * 70)
    
    update_plan = process_validated_contributions(
        validated_contributions=validated_contributions,
        current_skill_confidence=current_confidence,
        applied_contributions=[],
        monthly_growth_tracker={}
    )
    
    # Validate plan
    is_valid, errors = validate_update_plan(update_plan)
    
    if is_valid:
        print("\n✓ Update plan is valid")
    else:
        print("\n✗ Update plan has errors:")
        for error in errors:
            print(f"  - {error}")
    
    print("\nUpdate Plan:")
    print("-" * 70)
    print(json.dumps(update_plan, indent=2))
    
    # Display summary
    print("\n" + "=" * 70)
    print("Confidence Updates Summary:")
    print("=" * 70)
    for update in update_plan['updates']:
        print(f"\n{update['skill']}:")
        print(f"  Old: {update['oldConfidence']}%")
        print(f"  New: {update['newConfidence']}%")
        print(f"  Increment: +{update['increment']}%")
        print(f"  Source: {update['sourceContributionId']}")
        print(f"  Level: {update['contributionLevel']} ({update['role']})")
    
    print("\n" + "=" * 70)
    print("✓ Module 4E test complete")
    print("=" * 70)

