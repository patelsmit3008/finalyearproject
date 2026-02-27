"""
Core Data Models for Helix AI System

This module defines Pydantic models for all core entities used across the system.
These models are FastAPI-compatible and provide:
- Type safety and validation
- Serialization/deserialization
- Default values and optional fields
- Clear field documentation

Models:
- Employee: Core employee information
- ResumeProfile: Parsed resume data and extracted skills
- Project: Project definitions with skill requirements
- ProjectContribution: Employee skill contributions to projects
- EmployeeProgress: Aggregated employee progress metrics

Author: Helix AI System
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional
from enum import Enum
from pydantic import BaseModel, Field, validator


# ============================================================================
# Enums for Type Safety
# ============================================================================

class EmployeeRole(str, Enum):
    """Employee role types."""
    EMPLOYEE = "EMPLOYEE"
    HR = "HR"
    PROJECT_MANAGER = "PROJECT_MANAGER"


class ProjectStatus(str, Enum):
    """Project status values."""
    PLANNING = "Planning"
    IN_PROGRESS = "In Progress"
    UPCOMING = "Upcoming"
    COMPLETED = "Completed"
    ON_HOLD = "On Hold"


class ContributionLevel(str, Enum):
    """Level of contribution in a project."""
    MINOR = "Minor"
    MODERATE = "Moderate"
    SIGNIFICANT = "Significant"


class ContributionRole(str, Enum):
    """Role in project contribution."""
    ASSISTANT = "Assistant"
    CONTRIBUTOR = "Contributor"
    LEAD = "Lead"
    ARCHITECT = "Architect"


class ContributionStatus(str, Enum):
    """Status of a project contribution."""
    PENDING = "Pending"
    VALIDATED = "Validated"
    REJECTED = "Rejected"


# ============================================================================
# Core Models
# ============================================================================

class Employee(BaseModel):
    """
    Core employee information model.
    
    Represents an employee in the system with basic profile information.
    Used for authentication, role-based access, and employee identification.
    """
    employee_id: str = Field(..., description="Unique employee identifier (Firebase UID)")
    name: str = Field(..., min_length=1, description="Employee full name")
    email: str = Field(..., description="Employee email address")
    role: EmployeeRole = Field(..., description="Employee role (EMPLOYEE, HR, PROJECT_MANAGER)")
    department: Optional[str] = Field(None, description="Employee department")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Account creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    
    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ResumeProfile(BaseModel):
    """
    Parsed resume data and extracted information.
    
    Contains structured data extracted from employee resumes including:
    - Detected skills
    - Estimated experience
    - Domain/role matches
    - Raw text metadata
    """
    employee_id: str = Field(..., description="Employee identifier")
    skills: List[str] = Field(default_factory=list, description="List of detected skills from resume")
    experience_years: Optional[float] = Field(None, ge=0, description="Estimated years of experience")
    domains: List[str] = Field(default_factory=list, description="Detected domains/roles (e.g., 'Frontend', 'Backend')")
    text_length: int = Field(0, ge=0, description="Total character count of extracted resume text")
    file_type: Optional[str] = Field(None, description="Original file type (PDF, DOCX)")
    analyzed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Resume analysis timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Project(BaseModel):
    """
    Project definition with skill requirements and eligibility criteria.
    
    Represents a project that employees can be assigned to or contribute skills to.
    Includes required skills, minimum Helix score thresholds, and project metadata.
    """
    project_id: str = Field(..., description="Unique project identifier")
    project_name: str = Field(..., min_length=1, description="Project name")
    required_skills: List[str] = Field(..., min_items=1, description="List of required skills for this project")
    optional_skills: List[str] = Field(default_factory=list, description="List of optional/complementary skills for this project")
    minimum_helix_score: int = Field(0, ge=0, le=100, description="Minimum Helix score required for assignment")
    status: ProjectStatus = Field(ProjectStatus.PLANNING, description="Current project status")
    start_date: Optional[datetime] = Field(None, description="Project start date")
    end_date: Optional[datetime] = Field(None, description="Project end date")
    created_by: Optional[str] = Field(None, description="User ID who created the project")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Project creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    description: Optional[str] = Field(None, description="Project description")
    domain: Optional[str] = Field(None, description="Project domain (e.g., 'Frontend', 'Backend', 'Full Stack')")
    difficulty_level: Optional[str] = Field(None, description="Project difficulty level: 'Beginner', 'Intermediate', or 'Advanced'")
    active: bool = Field(True, description="Whether the project is currently active")
    
    @validator('end_date')
    def validate_end_date(cls, v, values):
        """Ensure end_date is after start_date if both are provided."""
        if v and 'start_date' in values and values['start_date']:
            if v < values['start_date']:
                raise ValueError('end_date must be after start_date')
        return v
    
    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ProjectContribution(BaseModel):
    """
    Employee skill contribution to a project.
    
    Tracks an employee's use of a specific skill in a project, including:
    - Contribution level and role
    - Validation status
    - Impact on skill confidence
    - Manager feedback
    """
    contribution_id: Optional[str] = Field(None, description="Unique contribution identifier")
    employee_id: str = Field(..., description="Employee identifier")
    employee_name: str = Field(..., min_length=1, description="Employee name")
    project_id: str = Field(..., description="Project identifier")
    project_name: str = Field(..., min_length=1, description="Project name")
    skill_used: str = Field(..., min_length=1, description="Skill used in the project")
    role_in_project: ContributionRole = Field(ContributionRole.CONTRIBUTOR, description="Employee's role in the project")
    contribution_level: ContributionLevel = Field(ContributionLevel.MODERATE, description="Level of contribution")
    confidence_impact: float = Field(0.0, ge=0, le=100, description="Suggested impact on skill confidence (0-100)")
    status: ContributionStatus = Field(ContributionStatus.PENDING, description="Validation status")
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Submission timestamp")
    validated_at: Optional[datetime] = Field(None, description="Validation timestamp")
    validated_by: Optional[str] = Field(None, description="User ID who validated/rejected")
    manager_note: Optional[str] = Field(None, description="Manager note for validated contributions")
    rejection_feedback: Optional[Dict[str, str]] = Field(None, description="Rejection feedback with message and metadata")
    manager_comment: Optional[str] = Field(None, description="Legacy manager comment field (for backward compatibility)")
    
    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class SkillConfidence(BaseModel):
    """
    Skill confidence tracking for an employee.
    
    Represents an employee's confidence level in a specific skill, including:
    - Current confidence percentage
    - Source of confidence (resume, project, etc.)
    - Status (baseline, updated, etc.)
    - Update history
    """
    employee_id: str = Field(..., description="Employee identifier")
    skill: str = Field(..., min_length=1, description="Skill name")
    confidence: int = Field(..., ge=0, le=100, description="Confidence percentage (0-100)")
    source: str = Field("resume", description="Source of confidence (resume, project, etc.)")
    status: str = Field("baseline", description="Status (baseline, updated, etc.)")
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Last update timestamp")
    applied_to_confidence: bool = Field(False, description="Whether this update has been applied to confidence")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class HelixPoints(BaseModel):
    """
    Helix Points tracking for an employee.
    
    Represents an employee's Helix Points, which are awarded based on:
    - Validated project contributions
    - Skill confidence growth
    - Contribution consistency
    """
    employee_id: str = Field(..., description="Employee identifier")
    total_points: int = Field(0, ge=0, description="Total Helix Points accumulated")
    points_by_skill: Dict[str, int] = Field(default_factory=dict, description="Points per skill")
    last_awarded_at: Optional[datetime] = Field(None, description="Last points award timestamp")
    points_awarded: bool = Field(False, description="Whether points have been awarded for this contribution")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PromotionReadiness(BaseModel):
    """
    Promotion readiness metrics for an employee.
    
    Aggregated metrics used to assess an employee's readiness for promotion, including:
    - Overall readiness score
    - Skill gaps
    - Recommended next role
    - Time-to-promotion estimate
    """
    employee_id: str = Field(..., description="Employee identifier")
    promotion_readiness_score: float = Field(0.0, ge=0, le=100, description="Overall readiness score (0-100)")
    readiness_level: str = Field("Low", description="Readiness level (Low, Medium, High)")
    recommended_next_role: Optional[str] = Field(None, description="Recommended next role")
    skill_gaps: List[str] = Field(default_factory=list, description="List of missing or low-confidence skills for next role")
    estimated_time_to_promotion: Optional[str] = Field(None, description="Estimated time to promotion (e.g., '4-6 months')")
    calculated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Calculation timestamp")
    
    # Detailed metrics
    average_skill_confidence: float = Field(0.0, ge=0, le=100, description="Average skill confidence across all skills")
    confidence_growth_rate: float = Field(0.0, description="Rate of confidence growth over time")
    points_accumulation_rate: float = Field(0.0, description="Rate of Helix Points accumulation")
    contribution_consistency: float = Field(0.0, ge=0, le=1, description="Consistency of contributions (0-1)")
    skill_diversity: float = Field(0.0, ge=0, le=1, description="Diversity of skills (0-1)")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class SkillPoints(BaseModel):
    """Skill points and level information."""
    points: int = Field(0, ge=0, description="Total skill points")
    level: str = Field("Beginner", description="Current skill level")
    next_threshold: Optional[int] = Field(None, description="Points required for next level")
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Last update timestamp")
    source: str = Field("resume", description="Source of skill (resume, project)")


class EmployeeSkillProfile(BaseModel):
    """
    Persistent employee skill profile linked to userId.
    
    This is the single source of truth for employee skills, experience, and domains.
    Updated after resume analysis and used by My Progress and Project Matching.
    """
    user_id: str = Field(..., description="Employee user ID (Firebase UID)")
    skills: List[str] = Field(default_factory=list, description="List of skills extracted from resume")
    domains: List[str] = Field(default_factory=list, description="List of domains/roles from resume")
    experience_years: float = Field(0.0, ge=0, description="Years of experience")
    text_length: int = Field(0, ge=0, description="Resume text length")
    file_type: Optional[str] = Field(None, description="Original resume file type")
    
    # Skill points and levels (key: skill name, value: SkillPoints)
    skill_points: Dict[str, SkillPoints] = Field(default_factory=dict, description="Skill points and levels per skill")
    
    # Completed projects
    completed_projects: List[str] = Field(default_factory=list, description="List of completed project IDs")
    
    # Promotion readiness
    promotion_readiness_score: float = Field(0.0, ge=0, le=100, description="Promotion readiness score (0-100)")
    promotion_readiness_level: str = Field("Low", description="Readiness level (Low, Medium, High)")
    
    analyzed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Last resume analysis timestamp")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Profile creation timestamp")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Last update timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class EmployeeProgress(BaseModel):
    """
    Aggregated employee progress metrics.
    
    Comprehensive view of an employee's progress including:
    - Skill confidence across all skills
    - Helix Points summary
    - Promotion readiness
    - Project contributions summary
    """
    employee_id: str = Field(..., description="Employee identifier")
    employee_name: str = Field(..., description="Employee name")
    
    # Skill confidence summary
    skill_confidence: Dict[str, int] = Field(default_factory=dict, description="Confidence per skill (skill -> confidence %)")
    total_skills: int = Field(0, ge=0, description="Total number of skills")
    average_confidence: float = Field(0.0, ge=0, le=100, description="Average skill confidence")
    
    # Helix Points summary
    total_helix_points: int = Field(0, ge=0, description="Total Helix Points")
    points_by_skill: Dict[str, int] = Field(default_factory=dict, description="Points per skill")
    
    # Project contributions summary
    total_contributions: int = Field(0, ge=0, description="Total project contributions")
    validated_contributions: int = Field(0, ge=0, description="Number of validated contributions")
    pending_contributions: int = Field(0, ge=0, description="Number of pending contributions")
    
    # Promotion readiness
    promotion_readiness: Optional[PromotionReadiness] = Field(None, description="Promotion readiness metrics")
    
    # Timestamps
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Last update timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

