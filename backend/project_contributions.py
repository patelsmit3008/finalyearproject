"""
Module 4C: Project-Based Skill Contribution Tracking for Helix AI

This module tracks employee skill usage in internal projects as evidence
for future validation and confidence updates.

Key Rules:
- Tracks contributions only (does NOT update confidence)
- Does NOT award Helix Points
- Default status: "Pending" (requires validation)
- Designed for future integration with validation and Helix Points engine

Dependencies:
    - None (standalone module, can integrate with Firestore/DB later)

Author: Helix AI System
"""

from typing import Dict, List, Optional
from datetime import datetime, timezone
import json


# Contribution levels
CONTRIBUTION_LEVELS = ['Minor', 'Moderate', 'Significant']

# Contribution roles
CONTRIBUTION_ROLES = ['Assistant', 'Contributor', 'Lead', 'Architect']

# Contribution statuses
CONTRIBUTION_STATUS = ['Pending', 'Validated', 'Rejected']


def create_contribution_record(
    employee_id: str,
    employee_name: str,
    project_id: str,
    project_name: str,
    skill: str,
    role: str = 'Contributor',
    contribution_level: str = 'Moderate',
    confidence_impact: float = 0.0,
    status: str = 'Pending'
) -> Dict:
    """
    Create a project skill contribution record.
    
    This function creates a structured contribution record that tracks
    an employee's skill usage in a project. The record is created with
    "Pending" status by default and requires validation before it can
    affect skill confidence.
    
    Args:
        employee_id (str): Employee UID
        employee_name (str): Employee name
        project_id (str): Project identifier
        project_name (str): Project name
        skill (str): Skill used in the project (e.g., 'React', 'Flutter')
        role (str): Role in project (default: 'Contributor')
        contribution_level (str): Level of contribution (default: 'Moderate')
        confidence_impact (float): Suggested impact on confidence (not applied yet)
        status (str): Status (default: 'Pending')
        
    Returns:
        Dict: Contribution record with structure:
            {
                'employeeId': str,
                'employeeName': str,
                'projectId': str,
                'projectName': str,
                'skill': str,
                'role': str,
                'contributionLevel': str,
                'confidenceImpact': float,
                'status': str,
                'submittedAt': str,  # ISO timestamp
                'validatedAt': Optional[str],
                'validatedBy': Optional[str]
            }
    """
    # Validate inputs
    if not employee_id or not employee_name:
        raise ValueError("employee_id and employee_name are required")
    
    if not project_id or not project_name:
        raise ValueError("project_id and project_name are required")
    
    if not skill:
        raise ValueError("skill is required")
    
    # Validate contribution level
    if contribution_level not in CONTRIBUTION_LEVELS:
        raise ValueError(f"contribution_level must be one of {CONTRIBUTION_LEVELS}")
    
    # Validate role
    if role not in CONTRIBUTION_ROLES:
        raise ValueError(f"role must be one of {CONTRIBUTION_ROLES}")
    
    # Validate status
    if status not in CONTRIBUTION_STATUS:
        raise ValueError(f"status must be one of {CONTRIBUTION_STATUS}")
    
    # Create contribution record
    contribution = {
        'employeeId': employee_id,
        'employeeName': employee_name,
        'projectId': project_id,
        'projectName': project_name,
        'skill': skill,
        'role': role,
        'contributionLevel': contribution_level,
        'confidenceImpact': confidence_impact,
        'status': status,
        'submittedAt': datetime.now(timezone.utc).isoformat(),
        'validatedAt': None,
        'validatedBy': None
    }
    
    return contribution


def calculate_suggested_confidence_impact(
    contribution_level: str,
    role: str
) -> float:
    """
    Calculate suggested confidence impact based on contribution level and role.
    
    This is a heuristic calculation that suggests how much a contribution
    should impact skill confidence. The impact is NOT applied automatically
    and requires validation.
    
    Formula:
        Base impact from contribution level:
            Minor: 2%
            Moderate: 5%
            Significant: 10%
        
        Role multiplier:
            Assistant: 0.5x
            Contributor: 1.0x
            Lead: 1.5x
            Architect: 2.0x
    
    Args:
        contribution_level (str): Contribution level ('Minor', 'Moderate', 'Significant')
        role (str): Role in project
        
    Returns:
        float: Suggested confidence impact percentage
    """
    # Base impact from contribution level
    level_impact = {
        'Minor': 2.0,
        'Moderate': 5.0,
        'Significant': 10.0
    }
    
    # Role multiplier
    role_multiplier = {
        'Assistant': 0.5,
        'Contributor': 1.0,
        'Lead': 1.5,
        'Architect': 2.0
    }
    
    base_impact = level_impact.get(contribution_level, 5.0)
    multiplier = role_multiplier.get(role, 1.0)
    
    suggested_impact = base_impact * multiplier
    
    # Cap at reasonable maximum (e.g., 20%)
    return min(suggested_impact, 20.0)


def get_contributions_by_employee(
    contributions: List[Dict],
    employee_id: str,
    status: Optional[str] = None
) -> List[Dict]:
    """
    Get all contributions for a specific employee.
    
    Args:
        contributions (List[Dict]): List of all contribution records
        employee_id (str): Employee UID
        status (Optional[str]): Filter by status (None = all statuses)
        
    Returns:
        List[Dict]: Filtered contribution records
    """
    filtered = [
        c for c in contributions
        if c.get('employeeId') == employee_id
    ]
    
    if status:
        filtered = [c for c in filtered if c.get('status') == status]
    
    return filtered


def get_contributions_by_project(
    contributions: List[Dict],
    project_id: str,
    status: Optional[str] = None
) -> List[Dict]:
    """
    Get all contributions for a specific project.
    
    Args:
        contributions (List[Dict]): List of all contribution records
        project_id (str): Project identifier
        status (Optional[str]): Filter by status (None = all statuses)
        
    Returns:
        List[Dict]: Filtered contribution records
    """
    filtered = [
        c for c in contributions
        if c.get('projectId') == project_id
    ]
    
    if status:
        filtered = [c for c in filtered if c.get('status') == status]
    
    return filtered


def get_contributions_by_skill(
    contributions: List[Dict],
    skill: str,
    employee_id: Optional[str] = None,
    status: Optional[str] = None
) -> List[Dict]:
    """
    Get all contributions for a specific skill.
    
    Args:
        contributions (List[Dict]): List of all contribution records
        skill (str): Skill name
        employee_id (Optional[str]): Filter by employee (None = all employees)
        status (Optional[str]): Filter by status (None = all statuses)
        
    Returns:
        List[Dict]: Filtered contribution records
    """
    filtered = [
        c for c in contributions
        if c.get('skill') == skill
    ]
    
    if employee_id:
        filtered = [c for c in filtered if c.get('employeeId') == employee_id]
    
    if status:
        filtered = [c for c in filtered if c.get('status') == status]
    
    return filtered


def get_pending_contributions(
    contributions: List[Dict],
    employee_id: Optional[str] = None
) -> List[Dict]:
    """
    Get all pending contributions (awaiting validation).
    
    Args:
        contributions (List[Dict]): List of all contribution records
        employee_id (Optional[str]): Filter by employee (None = all employees)
        
    Returns:
        List[Dict]: Pending contribution records
    """
    return get_contributions_by_employee(
        contributions,
        employee_id,
        status='Pending'
    ) if employee_id else [
        c for c in contributions
        if c.get('status') == 'Pending'
    ]


def validate_contribution(
    contribution: Dict,
    validated_by: str,
    approved: bool = True
) -> Dict:
    """
    Validate a contribution record (for future use with Module 4D).
    
    This function updates the contribution status to 'Validated' or 'Rejected'
    based on manager approval. The actual confidence update happens elsewhere.
    
    Args:
        contribution (Dict): Contribution record to validate
        validated_by (str): Manager/validator UID or name
        approved (bool): Whether the contribution is approved
        
    Returns:
        Dict: Updated contribution record
    """
    updated = contribution.copy()
    
    if approved:
        updated['status'] = 'Validated'
    else:
        updated['status'] = 'Rejected'
    
    updated['validatedAt'] = datetime.now(timezone.utc).isoformat()
    updated['validatedBy'] = validated_by
    
    return updated


def get_employee_skill_summary(
    contributions: List[Dict],
    employee_id: str
) -> Dict:
    """
    Get a summary of an employee's skill contributions.
    
    This function aggregates contribution data for an employee,
    useful for displaying in "My Progress" page.
    
    Args:
        contributions (List[Dict]): List of all contribution records
        employee_id (str): Employee UID
        
    Returns:
        Dict: Summary with structure:
            {
                'employeeId': str,
                'totalContributions': int,
                'validatedContributions': int,
                'pendingContributions': int,
                'skills': [
                    {
                        'skill': str,
                        'totalContributions': int,
                        'validatedContributions': int,
                        'totalImpact': float
                    }
                ]
            }
    """
    employee_contributions = get_contributions_by_employee(contributions, employee_id)
    
    # Group by skill
    skill_data = {}
    for contrib in employee_contributions:
        skill = contrib.get('skill')
        if skill not in skill_data:
            skill_data[skill] = {
                'skill': skill,
                'totalContributions': 0,
                'validatedContributions': 0,
                'totalImpact': 0.0
            }
        
        skill_data[skill]['totalContributions'] += 1
        
        if contrib.get('status') == 'Validated':
            skill_data[skill]['validatedContributions'] += 1
            skill_data[skill]['totalImpact'] += contrib.get('confidenceImpact', 0.0)
    
    return {
        'employeeId': employee_id,
        'totalContributions': len(employee_contributions),
        'validatedContributions': len([c for c in employee_contributions if c.get('status') == 'Validated']),
        'pendingContributions': len([c for c in employee_contributions if c.get('status') == 'Pending']),
        'skills': list(skill_data.values())
    }


# Test block
if __name__ == "__main__":
    """
    Test the project contribution tracking module.
    
    Usage:
        python project_contributions.py
    """
    print("=" * 70)
    print("Project-Based Skill Contribution Tracking - Module 4C")
    print("=" * 70)
    
    # Mock data storage (replace with Firestore/DB in production)
    contributions = []
    
    # Test: Create contribution records
    print("\n1. Creating contribution records...")
    print("-" * 70)
    
    contrib1 = create_contribution_record(
        employee_id='emp_001',
        employee_name='John Doe',
        project_id='proj_001',
        project_name='Customer Portal Redesign',
        skill='React',
        role='Contributor',
        contribution_level='Moderate',
        confidence_impact=calculate_suggested_confidence_impact('Moderate', 'Contributor')
    )
    contributions.append(contrib1)
    print("Created contribution 1:")
    print(json.dumps(contrib1, indent=2))
    
    contrib2 = create_contribution_record(
        employee_id='emp_001',
        employee_name='John Doe',
        project_id='proj_002',
        project_name='API Integration',
        skill='Node.js',
        role='Lead',
        contribution_level='Significant',
        confidence_impact=calculate_suggested_confidence_impact('Significant', 'Lead')
    )
    contributions.append(contrib2)
    print("\nCreated contribution 2:")
    print(json.dumps(contrib2, indent=2))
    
    contrib3 = create_contribution_record(
        employee_id='emp_002',
        employee_name='Jane Smith',
        project_id='proj_001',
        project_name='Customer Portal Redesign',
        skill='React',
        role='Assistant',
        contribution_level='Minor',
        confidence_impact=calculate_suggested_confidence_impact('Minor', 'Assistant')
    )
    contributions.append(contrib3)
    print("\nCreated contribution 3:")
    print(json.dumps(contrib3, indent=2))
    
    # Test: Query functions
    print("\n" + "=" * 70)
    print("2. Testing query functions...")
    print("=" * 70)
    
    print("\nContributions by employee (emp_001):")
    emp_contribs = get_contributions_by_employee(contributions, 'emp_001')
    print(f"Found {len(emp_contribs)} contributions")
    for c in emp_contribs:
        print(f"  • {c['skill']} in {c['projectName']} ({c['status']})")
    
    print("\nContributions by project (proj_001):")
    proj_contribs = get_contributions_by_project(contributions, 'proj_001')
    print(f"Found {len(proj_contribs)} contributions")
    for c in proj_contribs:
        print(f"  • {c['employeeName']} - {c['skill']} ({c['status']})")
    
    print("\nContributions by skill (React):")
    skill_contribs = get_contributions_by_skill(contributions, 'React')
    print(f"Found {len(skill_contribs)} contributions")
    for c in skill_contribs:
        print(f"  • {c['employeeName']} in {c['projectName']} ({c['status']})")
    
    print("\nPending contributions:")
    pending = get_pending_contributions(contributions)
    print(f"Found {len(pending)} pending contributions")
    for c in pending:
        print(f"  • {c['employeeName']} - {c['skill']} in {c['projectName']}")
    
    # Test: Validation
    print("\n" + "=" * 70)
    print("3. Testing validation...")
    print("=" * 70)
    
    validated = validate_contribution(contrib1, validated_by='manager_001', approved=True)
    print("Validated contribution:")
    print(json.dumps(validated, indent=2))
    
    # Update in list (for testing)
    contributions[0] = validated
    
    # Test: Employee summary
    print("\n" + "=" * 70)
    print("4. Employee skill summary...")
    print("=" * 70)
    
    summary = get_employee_skill_summary(contributions, 'emp_001')
    print(json.dumps(summary, indent=2))
    
    print("\n" + "=" * 70)
    print("✓ Module 4C test complete")
    print("=" * 70)

