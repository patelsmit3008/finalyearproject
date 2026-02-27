"""
Module 4B: Skill Confidence Initialization for Helix AI

This module converts parsed resume data into a structured skill-confidence model.
It initializes baseline skill confidence from resume data only.

Key Rules:
- Resume-based confidence: 30% - 70% (never exceeds 70%)
- Heuristic-based (no ML)
- Does NOT assign Helix Points
- Does NOT calculate growth metrics

Dependencies:
    - resume_parser.py (Module 4A) - for parsed resume data structure

Author: Helix AI System
"""

from typing import Dict, List, Optional


# Configuration constants
BASE_CONFIDENCE = 40  # Base confidence percentage
EXPERIENCE_BONUS_PER_YEAR = 5  # Additional confidence per year of experience
MAX_EXPERIENCE_BONUS = 20  # Maximum bonus from experience (4 years)
MIN_CONFIDENCE = 30  # Minimum confidence from resume
MAX_CONFIDENCE = 70  # Maximum confidence from resume


def calculate_skill_confidence(
    skill: str,
    experience_years: Optional[float],
    domain_match: bool = False
) -> int:
    """
    Calculate baseline confidence for a skill based on resume data.
    
    Formula:
        confidence = BASE_CONFIDENCE + (experience_bonus)
        experience_bonus = min(EXPERIENCE_BONUS_PER_YEAR * years, MAX_EXPERIENCE_BONUS)
        Final confidence is capped between MIN_CONFIDENCE and MAX_CONFIDENCE
    
    Args:
        skill (str): Skill name
        experience_years (Optional[float]): Years of experience from resume
        domain_match (bool): Whether skill matches detected domains (future use)
        
    Returns:
        int: Confidence percentage (30-70)
    """
    # Start with base confidence
    confidence = BASE_CONFIDENCE
    
    # Add experience bonus
    if experience_years is not None and experience_years > 0:
        experience_bonus = min(
            int(EXPERIENCE_BONUS_PER_YEAR * experience_years),
            MAX_EXPERIENCE_BONUS
        )
        confidence += experience_bonus
    
    # Future: Add domain match bonus if needed
    # if domain_match:
    #     confidence += 5
    
    # Cap confidence within allowed range
    confidence = max(MIN_CONFIDENCE, min(confidence, MAX_CONFIDENCE))
    
    return confidence


def initialize_skill_confidence(parsed_resume: Dict) -> List[Dict]:
    """
    Initialize skill confidence from parsed resume data.
    
    This function takes the output from resume_parser.py and converts it
    into a structured skill-confidence model.
    
    Args:
        parsed_resume (Dict): Parsed resume data with structure:
            {
                'skills': List[str],  # e.g., ['React', 'Node.js', 'AWS']
                'experience_years': Optional[float],  # e.g., 2.0
                'domains': List[str],  # e.g., ['Frontend', 'Cloud']
                ... (other fields from resume_parser)
            }
    
    Returns:
        List[Dict]: List of skill confidence objects:
            [
                {
                    'skill': str,
                    'confidence': int,  # 30-70
                    'source': 'resume',
                    'status': 'baseline'
                },
                ...
            ]
    """
    # Validate input
    if not parsed_resume:
        return []
    
    skills = parsed_resume.get('skills', [])
    experience_years = parsed_resume.get('experience_years')
    domains = parsed_resume.get('domains', [])
    
    if not skills:
        return []
    
    # Initialize skill confidence for each skill
    skill_confidence_list = []
    
    for skill in skills:
        # Check if skill matches any detected domain (for future enhancement)
        domain_match = _check_domain_match(skill, domains)
        
        # Calculate confidence
        confidence = calculate_skill_confidence(
            skill=skill,
            experience_years=experience_years,
            domain_match=domain_match
        )
        
        # Create skill confidence object
        skill_confidence = {
            'skill': skill,
            'confidence': confidence,
            'source': 'resume',
            'status': 'baseline'
        }
        
        skill_confidence_list.append(skill_confidence)
    
    return skill_confidence_list


def _check_domain_match(skill: str, domains: List[str]) -> bool:
    """
    Check if a skill matches any detected domain.
    
    This is a helper function for future domain-based confidence adjustments.
    Currently returns False, but can be extended.
    
    Args:
        skill (str): Skill name
        domains (List[str]): List of detected domains
        
    Returns:
        bool: True if skill matches a domain
    """
    # Simple mapping for future use
    # This can be extended with a skill-to-domain mapping dictionary
    skill_lower = skill.lower()
    
    domain_keywords = {
        'frontend': ['react', 'vue', 'angular', 'html', 'css', 'javascript'],
        'backend': ['node.js', 'django', 'flask', 'spring', 'express'],
        'cloud': ['aws', 'azure', 'gcp', 'docker', 'kubernetes'],
        'mobile': ['react native', 'flutter', 'ios', 'android', 'swift', 'kotlin'],
    }
    
    for domain in domains:
        domain_lower = domain.lower()
        if domain_lower in domain_keywords:
            keywords = domain_keywords[domain_lower]
            if any(keyword in skill_lower for keyword in keywords):
                return True
    
    return False


def format_skill_confidence_output(skill_confidence_list: List[Dict]) -> Dict:
    """
    Format skill confidence list into a structured output format.
    
    This can be used for API responses or database storage.
    
    Args:
        skill_confidence_list (List[Dict]): List of skill confidence objects
        
    Returns:
        Dict: Formatted output with metadata:
            {
                'skills': List[Dict],
                'total_skills': int,
                'average_confidence': float,
                'source': 'resume',
                'status': 'baseline'
            }
    """
    if not skill_confidence_list:
        return {
            'skills': [],
            'total_skills': 0,
            'average_confidence': 0.0,
            'source': 'resume',
            'status': 'baseline'
        }
    
    total_confidence = sum(skill['confidence'] for skill in skill_confidence_list)
    average_confidence = total_confidence / len(skill_confidence_list)
    
    return {
        'skills': skill_confidence_list,
        'total_skills': len(skill_confidence_list),
        'average_confidence': round(average_confidence, 1),
        'source': 'resume',
        'status': 'baseline'
    }


# Test block
if __name__ == "__main__":
    """
    Test the skill confidence initialization.
    
    Usage:
        python skill_confidence.py
    """
    print("=" * 70)
    print("Skill Confidence Initialization - Module 4B")
    print("=" * 70)
    
    # Mock parsed resume data (replace with real parser output later)
    mock_parsed_resume = {
        "skills": ["React", "Node.js", "AWS"],
        "experience_years": 2.0,
        "domains": ["Frontend", "Cloud"]
    }
    
    print("\nInput (Mock Parsed Resume):")
    print("-" * 70)
    import json
    print(json.dumps(mock_parsed_resume, indent=2))
    
    # Initialize skill confidence
    print("\n" + "=" * 70)
    print("Processing...")
    print("=" * 70)
    
    skill_confidence_list = initialize_skill_confidence(mock_parsed_resume)
    
    # Display results
    print("\nOutput (Skill Confidence):")
    print("-" * 70)
    print(json.dumps(skill_confidence_list, indent=2))
    
    # Display formatted output
    print("\n" + "=" * 70)
    print("Formatted Output:")
    print("=" * 70)
    formatted_output = format_skill_confidence_output(skill_confidence_list)
    print(json.dumps(formatted_output, indent=2))
    
    # Display calculation details
    print("\n" + "=" * 70)
    print("Calculation Details:")
    print("=" * 70)
    print(f"Base Confidence: {BASE_CONFIDENCE}%")
    print(f"Experience: {mock_parsed_resume['experience_years']} years")
    print(f"Experience Bonus: {min(int(EXPERIENCE_BONUS_PER_YEAR * mock_parsed_resume['experience_years']), MAX_EXPERIENCE_BONUS)}%")
    print(f"Confidence Range: {MIN_CONFIDENCE}% - {MAX_CONFIDENCE}%")
    print("\nPer-Skill Breakdown:")
    for skill_conf in skill_confidence_list:
        print(f"  • {skill_conf['skill']}: {skill_conf['confidence']}%")
    
    print("\n" + "=" * 70)
    print("✓ Skill confidence initialization complete")
    print("=" * 70)


