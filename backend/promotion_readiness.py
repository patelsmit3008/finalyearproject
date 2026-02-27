"""
Module 4G: Promotion Readiness Engine for Helix AI

This module predicts employee promotion readiness using skill confidence trends,
Helix Points accumulation, and contribution consistency.

Key Rules:
- Read-only (does NOT perform promotions)
- Deterministic and explainable logic
- No ML models or black-box calculations
- Advisory only - recommendations are not automated

Dependencies:
    - skill_confidence_updater.py (Module 4E) - for confidence data structure
    - helix_points_engine.py (Module 4F) - for points data structure

Author: Helix AI System
"""

from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
import json
import math


# Configuration constants
READINESS_THRESHOLD_LOW = 0
READINESS_THRESHOLD_MEDIUM = 40
READINESS_THRESHOLD_HIGH = 70
READINESS_MAX = 100

# Weight factors for readiness score
WEIGHT_AVERAGE_CONFIDENCE = 0.30
WEIGHT_CONFIDENCE_GROWTH = 0.25
WEIGHT_POINTS_RATE = 0.20
WEIGHT_CONTRIBUTION_CONSISTENCY = 0.15
WEIGHT_SKILL_DIVERSITY = 0.10

# Skill confidence thresholds
CONFIDENCE_THRESHOLD_PROMOTION = 70  # Minimum confidence for promotion-ready skills
CONFIDENCE_THRESHOLD_ADVANCED = 80  # Advanced skill level

# Role progression mapping (extensible)
ROLE_PROGRESSION = {
    'Junior Developer': {
        'next': 'Mid-Level Developer',
        'required_skills': ['Programming Language', 'Version Control'],
        'min_confidence': 60,
    },
    'Mid-Level Developer': {
        'next': 'Senior Developer',
        'required_skills': ['System Design', 'Code Review', 'Mentoring'],
        'min_confidence': 70,
    },
    'Senior Developer': {
        'next': 'Lead Developer',
        'required_skills': ['Architecture', 'Team Leadership', 'Project Management'],
        'min_confidence': 75,
    },
    'Lead Developer': {
        'next': 'Principal Engineer',
        'required_skills': ['Technical Strategy', 'Cross-team Collaboration', 'Innovation'],
        'min_confidence': 80,
    },
}


def calculate_average_confidence_score(skill_confidence: Dict[str, float]) -> float:
    """
    Calculate average skill confidence score.
    
    Args:
        skill_confidence (Dict[str, float]): Current confidence per skill
        
    Returns:
        float: Average confidence (0-100)
    """
    if not skill_confidence:
        return 0.0
    
    total = sum(skill_confidence.values())
    count = len(skill_confidence)
    
    return total / count if count > 0 else 0.0


def calculate_confidence_growth_rate(confidence_history: List[Dict]) -> float:
    """
    Calculate skill confidence growth rate over time.
    
    Uses linear regression on confidence values over time to determine trend.
    
    Args:
        confidence_history (List[Dict]): Historical confidence updates with timestamps
        
    Returns:
        float: Growth rate per month (can be negative)
    """
    if len(confidence_history) < 2:
        return 0.0
    
    # Sort by timestamp
    sorted_history = sorted(confidence_history, key=lambda x: x.get('appliedAt', ''))
    
    # Extract confidence values and calculate time deltas
    if len(sorted_history) < 2:
        return 0.0
    
    first_conf = sorted_history[0].get('newConfidence', 0)
    last_conf = sorted_history[-1].get('newConfidence', 0)
    
    # Calculate time span in months (approximate)
    first_time = sorted_history[0].get('appliedAt', '')
    last_time = sorted_history[-1].get('appliedAt', '')
    
    try:
        first_date = datetime.fromisoformat(first_time.replace('Z', '+00:00'))
        last_date = datetime.fromisoformat(last_time.replace('Z', '+00:00'))
        months_diff = (last_date - first_date).days / 30.0
        
        if months_diff <= 0:
            return 0.0
        
        growth_rate = (last_conf - first_conf) / months_diff
        return growth_rate
    except:
        # Fallback: simple average growth
        if len(sorted_history) >= 2:
            return (last_conf - first_conf) / max(len(sorted_history) - 1, 1)
        return 0.0


def calculate_points_accumulation_rate(points_history: List[Dict], months: int = 3) -> float:
    """
    Calculate Helix Points accumulation rate (points per month).
    
    Args:
        points_history (List[Dict]): Historical point awards with timestamps
        months (int): Time window in months (default: 3)
        
    Returns:
        float: Points per month
    """
    if not points_history:
        return 0.0
    
    # Filter to recent months
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=months * 30)
    
    recent_points = []
    for award in points_history:
        try:
            award_date = datetime.fromisoformat(award.get('awardedAt', '').replace('Z', '+00:00'))
            if award_date >= cutoff_date:
                recent_points.append(award.get('pointsAwarded', 0))
        except:
            continue
    
    if not recent_points:
        return 0.0
    
    total_points = sum(recent_points)
    return total_points / months


def calculate_contribution_consistency(contributions: List[Dict], months: int = 6) -> float:
    """
    Calculate contribution consistency score (0-100).
    
    Measures how consistently employee contributes over time.
    
    Args:
        contributions (List[Dict]): Validated contributions with timestamps
        months (int): Time window in months
        
    Returns:
        float: Consistency score (0-100)
    """
    if not contributions:
        return 0.0
    
    # Group contributions by month
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=months * 30)
    
    monthly_counts = {}
    for contrib in contributions:
        try:
            contrib_date = datetime.fromisoformat(contrib.get('validatedAt', '').replace('Z', '+00:00'))
            if contrib_date >= cutoff_date:
                month_key = contrib_date.strftime('%Y-%m')
                monthly_counts[month_key] = monthly_counts.get(month_key, 0) + 1
        except:
            continue
    
    if not monthly_counts:
        return 0.0
    
    # Calculate consistency: more months with contributions = higher score
    active_months = len(monthly_counts)
    max_possible_months = months
    
    consistency_score = (active_months / max_possible_months) * 100
    
    # Bonus for consistent volume (low variance)
    if active_months > 1:
        counts = list(monthly_counts.values())
        avg_count = sum(counts) / len(counts)
        variance = sum((c - avg_count) ** 2 for c in counts) / len(counts)
        std_dev = math.sqrt(variance)
        
        # Lower variance = higher consistency bonus
        consistency_bonus = max(0, 20 - (std_dev * 5))
        consistency_score = min(100, consistency_score + consistency_bonus)
    
    return consistency_score


def calculate_skill_diversity_score(skill_confidence: Dict[str, float], domains: List[str] = None) -> float:
    """
    Calculate skill diversity score (0-100).
    
    Measures how diverse employee's skills are across different domains.
    
    Args:
        skill_confidence (Dict[str, float]): Current confidence per skill
        domains (List[str]): Optional domain categories
        
    Returns:
        float: Diversity score (0-100)
    """
    if not skill_confidence:
        return 0.0
    
    # Simple diversity: more skills = higher score (capped)
    skill_count = len(skill_confidence)
    
    # Base score: 10 points per skill up to 10 skills (max 100)
    diversity_score = min(skill_count * 10, 100)
    
    # Bonus for skills above threshold
    high_confidence_skills = sum(1 for conf in skill_confidence.values() if conf >= CONFIDENCE_THRESHOLD_PROMOTION)
    diversity_score += min(high_confidence_skills * 5, 20)
    
    return min(100, diversity_score)


def identify_skill_gaps(
    current_skills: Dict[str, float],
    required_skills: List[str],
    min_confidence: float = CONFIDENCE_THRESHOLD_PROMOTION
) -> List[str]:
    """
    Identify skill gaps for promotion readiness.
    
    Args:
        current_skills (Dict[str, float]): Current skill confidence
        required_skills (List[str]): Required skills for next role
        min_confidence (float): Minimum confidence threshold
        
    Returns:
        List[str]: List of missing or low-confidence skills
    """
    gaps = []
    
    for skill in required_skills:
        current_conf = current_skills.get(skill, 0)
        if current_conf < min_confidence:
            gaps.append(skill)
    
    return gaps


def recommend_next_role(
    current_role: str,
    skill_confidence: Dict[str, float],
    dominant_domains: List[str]
) -> str:
    """
    Recommend next role based on current skills and domains.
    
    Args:
        current_role (str): Current employee role
        skill_confidence (Dict[str, float]): Current skill confidence
        dominant_domains (List[str]): Dominant skill domains
        
    Returns:
        str: Recommended next role
    """
    # Check role progression mapping
    if current_role in ROLE_PROGRESSION:
        return ROLE_PROGRESSION[current_role]['next']
    
    # Default progression if not in mapping
    role_progression_default = [
        'Junior Developer',
        'Mid-Level Developer',
        'Senior Developer',
        'Lead Developer',
        'Principal Engineer'
    ]
    
    if current_role in role_progression_default:
        current_index = role_progression_default.index(current_role)
        if current_index < len(role_progression_default) - 1:
            return role_progression_default[current_index + 1]
    
    # Fallback: suggest based on average confidence
    avg_conf = calculate_average_confidence_score(skill_confidence)
    if avg_conf >= 80:
        return 'Senior Developer'
    elif avg_conf >= 70:
        return 'Mid-Level Developer'
    else:
        return 'Junior Developer'


def estimate_time_to_promotion(
    current_readiness: float,
    target_readiness: float,
    confidence_growth_rate: float,
    points_rate: float
) -> str:
    """
    Estimate time to promotion based on current readiness and growth rates.
    
    Args:
        current_readiness (float): Current readiness score (0-100)
        target_readiness (float): Target readiness score (default: 70)
        confidence_growth_rate (float): Confidence growth per month
        points_rate (float): Points accumulation per month
        
    Returns:
        str: Estimated time range (e.g., "4-6 months")
    """
    if current_readiness >= target_readiness:
        return "Ready now"
    
    readiness_gap = target_readiness - current_readiness
    
    # Estimate based on growth rates
    # Assume readiness increases proportionally with confidence and points growth
    if confidence_growth_rate > 0:
        months_needed_conf = readiness_gap / (confidence_growth_rate * 2)  # Rough estimate
    else:
        months_needed_conf = 12  # Default if no growth
    
    if points_rate > 0:
        # Assume 10 points per month contributes ~1 point to readiness
        months_needed_points = readiness_gap / (points_rate / 10)
    else:
        months_needed_points = 12
    
    # Take average and add buffer
    avg_months = (months_needed_conf + months_needed_points) / 2
    min_months = max(1, int(avg_months * 0.8))
    max_months = int(avg_months * 1.2) + 1
    
    if min_months >= 12:
        return "12+ months"
    elif min_months == max_months:
        return f"{min_months} month{'s' if min_months > 1 else ''}"
    else:
        return f"{min_months}-{max_months} months"


def calculate_promotion_readiness(
    skill_confidence: Dict[str, float],
    confidence_history: List[Dict],
    points_history: List[Dict],
    contributions: List[Dict],
    current_role: str = "Developer"
) -> Dict:
    """
    Calculate comprehensive promotion readiness score.
    
    Args:
        skill_confidence (Dict[str, float]): Current skill confidence per skill
        confidence_history (List[Dict]): Historical confidence updates
        points_history (List[Dict]): Historical Helix Points awards
        contributions (List[Dict]): Validated project contributions
        current_role (str): Current employee role
        
    Returns:
        Dict: Promotion readiness object with structure:
            {
                'promotionReadinessScore': float (0-100),
                'readinessLevel': str ('Low' | 'Medium' | 'High'),
                'recommendedNextRole': str,
                'skillGaps': List[str],
                'estimatedTimeToPromotion': str,
                'factors': {
                    'averageConfidence': float,
                    'confidenceGrowthRate': float,
                    'pointsRate': float,
                    'contributionConsistency': float,
                    'skillDiversity': float
                }
            }
    """
    # Calculate individual factors
    avg_confidence = calculate_average_confidence_score(skill_confidence)
    confidence_growth = calculate_confidence_growth_rate(confidence_history)
    points_rate = calculate_points_accumulation_rate(points_history)
    consistency = calculate_contribution_consistency(contributions)
    diversity = calculate_skill_diversity_score(skill_confidence)
    
    # Normalize factors to 0-100 scale
    avg_conf_score = avg_confidence  # Already 0-100
    growth_score = min(100, max(0, (confidence_growth + 5) * 10))  # Normalize growth rate
    points_score = min(100, max(0, points_rate * 2))  # Normalize points rate
    consistency_score = consistency  # Already 0-100
    diversity_score = diversity  # Already 0-100
    
    # Calculate weighted readiness score
    readiness_score = (
        avg_conf_score * WEIGHT_AVERAGE_CONFIDENCE +
        growth_score * WEIGHT_CONFIDENCE_GROWTH +
        points_score * WEIGHT_POINTS_RATE +
        consistency_score * WEIGHT_CONTRIBUTION_CONSISTENCY +
        diversity_score * WEIGHT_SKILL_DIVERSITY
    )
    
    # Ensure bounds
    readiness_score = max(0, min(100, readiness_score))
    
    # Determine readiness level
    if readiness_score >= READINESS_THRESHOLD_HIGH:
        readiness_level = "High"
    elif readiness_score >= READINESS_THRESHOLD_MEDIUM:
        readiness_level = "Medium"
    else:
        readiness_level = "Low"
    
    # Recommend next role
    dominant_domains = []  # Can be extended to analyze skill domains
    recommended_role = recommend_next_role(current_role, skill_confidence, dominant_domains)
    
    # Identify skill gaps
    required_skills = ROLE_PROGRESSION.get(recommended_role, {}).get('required_skills', [])
    skill_gaps = identify_skill_gaps(skill_confidence, required_skills)
    
    # Estimate time to promotion
    time_estimate = estimate_time_to_promotion(
        readiness_score,
        READINESS_THRESHOLD_HIGH,
        confidence_growth,
        points_rate
    )
    
    return {
        'promotionReadinessScore': round(readiness_score, 1),
        'readinessLevel': readiness_level,
        'recommendedNextRole': recommended_role,
        'skillGaps': skill_gaps,
        'estimatedTimeToPromotion': time_estimate,
        'factors': {
            'averageConfidence': round(avg_confidence, 1),
            'confidenceGrowthRate': round(confidence_growth, 2),
            'pointsRate': round(points_rate, 1),
            'contributionConsistency': round(consistency, 1),
            'skillDiversity': round(diversity, 1)
        }
    }


# Test block
if __name__ == "__main__":
    """
    Test the promotion readiness engine.
    
    Usage:
        python promotion_readiness.py
    """
    print("=" * 70)
    print("Promotion Readiness Engine - Module 4G")
    print("=" * 70)
    
    # Mock data
    skill_confidence = {
        'React': 75.0,
        'Node.js': 70.0,
        'AWS': 65.0,
        'TypeScript': 72.0,
    }
    
    confidence_history = [
        {'newConfidence': 50.0, 'appliedAt': '2024-01-01T00:00:00Z'},
        {'newConfidence': 55.0, 'appliedAt': '2024-02-01T00:00:00Z'},
        {'newConfidence': 60.0, 'appliedAt': '2024-03-01T00:00:00Z'},
        {'newConfidence': 65.0, 'appliedAt': '2024-04-01T00:00:00Z'},
        {'newConfidence': 70.0, 'appliedAt': '2024-05-01T00:00:00Z'},
    ]
    
    points_history = [
        {'pointsAwarded': 25, 'awardedAt': '2024-03-01T00:00:00Z'},
        {'pointsAwarded': 30, 'awardedAt': '2024-04-01T00:00:00Z'},
        {'pointsAwarded': 28, 'awardedAt': '2024-05-01T00:00:00Z'},
    ]
    
    contributions = [
        {'validatedAt': '2024-03-01T00:00:00Z'},
        {'validatedAt': '2024-04-01T00:00:00Z'},
        {'validatedAt': '2024-05-01T00:00:00Z'},
        {'validatedAt': '2024-06-01T00:00:00Z'},
    ]
    
    print("\nInput Data:")
    print("-" * 70)
    print(f"Current Skills: {len(skill_confidence)} skills")
    print(f"Confidence History: {len(confidence_history)} updates")
    print(f"Points History: {len(points_history)} awards")
    print(f"Contributions: {len(contributions)} validated")
    
    # Calculate readiness
    print("\n" + "=" * 70)
    print("Calculating Promotion Readiness...")
    print("=" * 70)
    
    readiness = calculate_promotion_readiness(
        skill_confidence=skill_confidence,
        confidence_history=confidence_history,
        points_history=points_history,
        contributions=contributions,
        current_role='Mid-Level Developer'
    )
    
    print("\nPromotion Readiness Result:")
    print("-" * 70)
    print(json.dumps(readiness, indent=2))
    
    print("\n" + "=" * 70)
    print("Readiness Breakdown:")
    print("=" * 70)
    print(f"Readiness Score: {readiness['promotionReadinessScore']}/100")
    print(f"Readiness Level: {readiness['readinessLevel']}")
    print(f"Recommended Next Role: {readiness['recommendedNextRole']}")
    print(f"Estimated Time: {readiness['estimatedTimeToPromotion']}")
    print(f"\nSkill Gaps: {', '.join(readiness['skillGaps']) if readiness['skillGaps'] else 'None'}")
    print("\nFactor Scores:")
    for factor, value in readiness['factors'].items():
        print(f"  {factor}: {value}")
    
    print("\n" + "=" * 70)
    print("✓ Module 4G test complete")
    print("=" * 70)

