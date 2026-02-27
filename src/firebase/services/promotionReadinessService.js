/**
 * Promotion Readiness Service - Firestore operations for promotion readiness
 * 
 * Calculates promotion readiness using skill confidence, Helix Points, and contributions
 * Used by Module 4G (Promotion Readiness Engine)
 */

import { getSkillConfidence, getConfidenceUpdateHistory } from './skillConfidenceService';
import { getHelixPoints, getPointAwardHistory } from './helixPointsService';
import { getEmployeeContributions } from './projectContributionsService';

/**
 * Calculate promotion readiness for an employee
 * 
 * This function fetches all relevant data and calculates readiness score
 * using backend logic principles (simplified JavaScript version).
 * 
 * @param {string} employeeId - Employee UID
 * @param {string} currentRole - Current employee role (optional)
 * @returns {Promise<Object|null>} Promotion readiness object or null
 */
export const calculatePromotionReadiness = async (employeeId, currentRole = 'Developer') => {
  try {
    if (!employeeId) {
      console.error("Promotion Readiness: employeeId is required");
      return null;
    }

    // Fetch all required data
    const [skillConfidenceDoc, confidenceHistory, pointsDoc, pointsHistory, contributions] = await Promise.all([
      getSkillConfidence(employeeId),
      getConfidenceUpdateHistory(employeeId),
      getHelixPoints(employeeId),
      getPointAwardHistory(employeeId),
      getEmployeeContributions(employeeId, 'Validated'),
    ]);

    // Extract skill confidence map
    const skillConfidence = {};
    if (skillConfidenceDoc?.skills) {
      Object.keys(skillConfidenceDoc.skills).forEach(skill => {
        skillConfidence[skill] = skillConfidenceDoc.skills[skill].confidence || 0;
      });
    }

    // Calculate factors
    const avgConfidence = calculateAverageConfidence(skillConfidence);
    const confidenceGrowth = calculateConfidenceGrowthRate(confidenceHistory);
    const pointsRate = calculatePointsRate(pointsHistory);
    const consistency = calculateContributionConsistency(contributions);
    const diversity = calculateSkillDiversity(skillConfidence);

    // Normalize factors
    const avgConfScore = avgConfidence;
    const growthScore = Math.min(100, Math.max(0, (confidenceGrowth + 5) * 10));
    const pointsScore = Math.min(100, Math.max(0, pointsRate * 2));
    const consistencyScore = consistency;
    const diversityScore = diversity;

    // Calculate weighted readiness score
    const weights = {
      averageConfidence: 0.30,
      confidenceGrowth: 0.25,
      pointsRate: 0.20,
      contributionConsistency: 0.15,
      skillDiversity: 0.10,
    };

    const readinessScore = Math.round((
      avgConfScore * weights.averageConfidence +
      growthScore * weights.confidenceGrowth +
      pointsScore * weights.pointsRate +
      consistencyScore * weights.contributionConsistency +
      diversityScore * weights.skillDiversity
    ) * 10) / 10;

    // Determine readiness level
    let readinessLevel = 'Low';
    if (readinessScore >= 70) {
      readinessLevel = 'High';
    } else if (readinessScore >= 40) {
      readinessLevel = 'Medium';
    }

    // Recommend next role
    const recommendedRole = recommendNextRole(currentRole, skillConfidence);

    // Identify skill gaps
    const skillGaps = identifySkillGaps(skillConfidence, recommendedRole);

    // Estimate time to promotion
    const timeEstimate = estimateTimeToPromotion(readinessScore, confidenceGrowth, pointsRate);

    return {
      promotionReadinessScore: Math.max(0, Math.min(100, readinessScore)),
      readinessLevel: readinessLevel,
      recommendedNextRole: recommendedRole,
      skillGaps: skillGaps,
      estimatedTimeToPromotion: timeEstimate,
      factors: {
        averageConfidence: Math.round(avgConfidence * 10) / 10,
        confidenceGrowthRate: Math.round(confidenceGrowth * 100) / 100,
        pointsRate: Math.round(pointsRate * 10) / 10,
        contributionConsistency: Math.round(consistencyScore * 10) / 10,
        skillDiversity: Math.round(diversityScore * 10) / 10,
      },
    };
  } catch (error) {
    console.error("Error calculating promotion readiness:", error);
    return null;
  }
};

/**
 * Calculate average skill confidence
 */
const calculateAverageConfidence = (skillConfidence) => {
  if (!skillConfidence || Object.keys(skillConfidence).length === 0) {
    return 0;
  }
  const values = Object.values(skillConfidence);
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

/**
 * Calculate confidence growth rate per month
 */
const calculateConfidenceGrowthRate = (history) => {
  if (!history || history.length < 2) {
    return 0;
  }

  const sorted = [...history].sort((a, b) => 
    new Date(a.appliedAt) - new Date(b.appliedAt)
  );

  const firstConf = sorted[0].newConfidence || 0;
  const lastConf = sorted[sorted.length - 1].newConfidence || 0;

  try {
    const firstDate = new Date(sorted[0].appliedAt);
    const lastDate = new Date(sorted[sorted.length - 1].appliedAt);
    const monthsDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 30);

    if (monthsDiff <= 0) return 0;
    return (lastConf - firstConf) / monthsDiff;
  } catch {
    return (lastConf - firstConf) / Math.max(sorted.length - 1, 1);
  }
};

/**
 * Calculate points accumulation rate (points per month)
 */
const calculatePointsRate = (history, months = 3) => {
  if (!history || history.length === 0) {
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);

  const recentPoints = history
    .filter(award => new Date(award.awardedAt) >= cutoffDate)
    .map(award => award.pointsAwarded || 0);

  if (recentPoints.length === 0) return 0;
  return recentPoints.reduce((sum, p) => sum + p, 0) / months;
};

/**
 * Calculate contribution consistency score
 */
const calculateContributionConsistency = (contributions, months = 6) => {
  if (!contributions || contributions.length === 0) {
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);

  const monthlyCounts = {};
  contributions.forEach(contrib => {
    try {
      const contribDate = new Date(contrib.validatedAt);
      if (contribDate >= cutoffDate) {
        const monthKey = contribDate.toISOString().substring(0, 7);
        monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
      }
    } catch {
      // Skip invalid dates
    }
  });

  if (Object.keys(monthlyCounts).length === 0) return 0;

  const activeMonths = Object.keys(monthlyCounts).length;
  const consistencyScore = (activeMonths / months) * 100;

  // Bonus for consistent volume
  if (activeMonths > 1) {
    const counts = Object.values(monthlyCounts);
    const avgCount = counts.reduce((sum, c) => sum + c, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - avgCount, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const consistencyBonus = Math.max(0, 20 - (stdDev * 5));
    return Math.min(100, consistencyScore + consistencyBonus);
  }

  return consistencyScore;
};

/**
 * Calculate skill diversity score
 */
const calculateSkillDiversity = (skillConfidence) => {
  if (!skillConfidence || Object.keys(skillConfidence).length === 0) {
    return 0;
  }

  const skillCount = Object.keys(skillConfidence).length;
  let diversityScore = Math.min(skillCount * 10, 100);

  const highConfidenceSkills = Object.values(skillConfidence).filter(conf => conf >= 70).length;
  diversityScore += Math.min(highConfidenceSkills * 5, 20);

  return Math.min(100, diversityScore);
};

/**
 * Recommend next role based on current role and skills
 */
const recommendNextRole = (currentRole, skillConfidence) => {
  const roleProgression = {
    'Junior Developer': 'Mid-Level Developer',
    'Mid-Level Developer': 'Senior Developer',
    'Senior Developer': 'Lead Developer',
    'Lead Developer': 'Principal Engineer',
  };

  if (roleProgression[currentRole]) {
    return roleProgression[currentRole];
  }

  // Fallback based on average confidence
  const avgConf = calculateAverageConfidence(skillConfidence);
  if (avgConf >= 80) return 'Senior Developer';
  if (avgConf >= 70) return 'Mid-Level Developer';
  return 'Junior Developer';
};

/**
 * Identify skill gaps for recommended role
 */
const identifySkillGaps = (skillConfidence, recommendedRole) => {
  const requiredSkillsMap = {
    'Mid-Level Developer': ['System Design', 'Code Review'],
    'Senior Developer': ['Architecture', 'Mentoring', 'Technical Leadership'],
    'Lead Developer': ['Team Leadership', 'Project Management', 'Cross-team Collaboration'],
    'Principal Engineer': ['Technical Strategy', 'Innovation', 'Industry Expertise'],
  };

  const requiredSkills = requiredSkillsMap[recommendedRole] || [];
  const gaps = [];

  requiredSkills.forEach(skill => {
    const currentConf = skillConfidence[skill] || 0;
    if (currentConf < 70) {
      gaps.push(skill);
    }
  });

  return gaps;
};

/**
 * Estimate time to promotion
 */
const estimateTimeToPromotion = (currentReadiness, confidenceGrowth, pointsRate) => {
  if (currentReadiness >= 70) {
    return 'Ready now';
  }

  const readinessGap = 70 - currentReadiness;

  let monthsNeededConf = 12;
  if (confidenceGrowth > 0) {
    monthsNeededConf = readinessGap / (confidenceGrowth * 2);
  }

  let monthsNeededPoints = 12;
  if (pointsRate > 0) {
    monthsNeededPoints = readinessGap / (pointsRate / 10);
  }

  const avgMonths = (monthsNeededConf + monthsNeededPoints) / 2;
  const minMonths = Math.max(1, Math.floor(avgMonths * 0.8));
  const maxMonths = Math.floor(avgMonths * 1.2) + 1;

  if (minMonths >= 12) {
    return '12+ months';
  } else if (minMonths === maxMonths) {
    return `${minMonths} month${minMonths > 1 ? 's' : ''}`;
  } else {
    return `${minMonths}-${maxMonths} months`;
  }
};

