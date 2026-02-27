/**
 * My Progress - Dynamic Employee Progress page.
 * Data from Firestore: progressService (overview, skills, reviews) and projectService (projects by assignedTo).
 * Sections: Summary cards, Skill growth, Active/Completed projects, Performance history, Improvement plan.
 */

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Award,
  Target,
  Briefcase,
  CheckCircle2,
  Loader2,
  AlertCircle,
  BarChart3,
  BookOpen,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getEmployeeOverview,
  getEmployeeSkills,
} from "../../firebase/services/progressService";
import { getPerformanceReviewsByEmployeeId } from "../../firebase/services/performanceReviewsService";
import { getEmployeeProjects as getEmployeeProjectsFromFirestore } from "../../firebase/services/projectService";
import { getEmployeeSkillGrowth } from "../../firebase/services/skillGrowthService";
import PerformanceTrendChart from "../charts/PerformanceTrendChart";

const BENCHMARK = 85;

export default function MyProgress() {
  const { user } = useAuth();
  const employeeId = user?.uid ?? null;

  const [overview, setOverview] = useState(null);
  const [skills, setSkills] = useState([]);
  const [skillGrowth, setSkillGrowth] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [activeProjects, setActiveProjects] = useState([]);
  const [completedProjects, setCompletedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch progress data (overview, skills, skill growth, performance_reviews, projects) from Firestore
  useEffect(() => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [overviewData, skillsData, skillGrowthData, reviewsData, projectsResult] = await Promise.all([
          getEmployeeOverview(employeeId),
          getEmployeeSkills(employeeId),
          getEmployeeSkillGrowth(employeeId),
          getPerformanceReviewsByEmployeeId(employeeId),
          getEmployeeProjectsFromFirestore(employeeId),
        ]);
        if (cancelled) return;
        setOverview(overviewData);
        setSkills(skillsData || []);
        setSkillGrowth(skillGrowthData || []);
        setReviews(reviewsData || []);
        setActiveProjects(projectsResult?.activeProjects ?? []);
        setCompletedProjects(projectsResult?.completedProjects ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Failed to load progress");
          setOverview({});
          setSkills([]);
          setSkillGrowth([]);
          setReviews([]);
          setActiveProjects([]);
          setCompletedProjects([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [employeeId]);

  // Chart data for PerformanceTrendChart: { period, overallScore, reviewDate, isCurrent } from performance_reviews (sorted by createdAt asc)
  const performanceChartData = useMemo(() => {
    const list = reviews || [];
    if (list.length === 0) return [];
    return list.map((r, i) => ({
      period: i === list.length - 1 ? "Current" : `${list.length - i} reviews ago`,
      overallScore: r.overallScore ?? 0,
      reviewDate: r.createdAt ? (typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString?.() ?? "") : "",
      isCurrent: i === list.length - 1,
    }));
  }, [reviews]);

  const performanceScore = (reviews?.length > 0 && reviews[reviews.length - 1]?.overallScore != null)
    ? Number(reviews[reviews.length - 1].overallScore)
    : (overview?.performanceScore ?? 0);
  const completionRate = overview?.completionRate ?? 0;
  const skillsCount = (skillGrowth?.length ?? 0) > 0 ? skillGrowth.length : (skills?.length ?? 0);
  const completedCount = completedProjects?.length ?? 0;
  const showImprovementPlan = performanceScore < 70 && performanceScore > 0;

  // —— Loading ——
  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="w-10 h-10 text-[#1e3a5f] animate-spin" />
          <p className="mt-4 text-sm text-gray-600 font-medium">Loading your progress...</p>
        </div>
      </div>
    );
  }

  // —— Not authenticated / no employeeId ——
  if (!employeeId) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Sign in required</h3>
          <p className="text-sm text-gray-600">Please sign in to view your progress.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16 box-border">
      {/* Page header */}
      <div className="mb-8 w-full space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-black">My Progress</h1>
        <p className="text-sm text-gray-600 font-medium">
          Performance score, skill growth, projects, and improvement plan.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-8 w-full">
        {/* A) Progress Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              label: "Performance Score",
              value: (reviews?.length > 0 && reviews[reviews.length - 1]?.overallScore != null)
                ? `${reviews[reviews.length - 1].overallScore}%`
                : (overview?.performanceScore != null ? `${overview.performanceScore}%` : "—"),
              icon: TrendingUp,
              description: "Overall performance (latest review)",
            },
            {
              label: "Completion Rate",
              value: overview?.completionRate != null ? `${overview.completionRate}%` : "—",
              icon: Target,
              description: "Task completion",
            },
            {
              label: "Skills Count",
              value: String(skillsCount),
              icon: Award,
              description: "Tracked skills",
            },
            {
              label: "Completed Projects",
              value: String(completedCount),
              icon: Briefcase,
              description: "Projects done",
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="bg-white rounded-xl p-7 shadow-sm border border-gray-200 hover:shadow-md transition-all duration-200 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1e3a5f]" />
                <div className="flex items-start justify-between mb-5">
                  <div className="p-3.5 rounded-xl bg-[#1e3a5f]/10">
                    <Icon className="w-6 h-6 text-[#1e3a5f]" />
                  </div>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{card.label}</p>
                <p className="text-3xl font-bold text-black mb-2 leading-tight">{card.value}</p>
                <p className="text-xs text-gray-500 font-medium">{card.description}</p>
              </div>
            );
          })}
        </section>

        {/* B) Skill Growth List (from employees/{uid}/skillGrowth; progress + PM note) */}
        <section className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-black">Skill Growth</h3>
            <p className="text-xs text-gray-500 font-medium">Level & progress</p>
          </div>
          {!skillGrowth || skillGrowth.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-sm text-gray-600 font-medium">No skills recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {skillGrowth.map((skill) => (
                <div
                  key={skill.id || skill.skillName}
                  className="border border-gray-200 rounded-xl p-5 hover:border-[#1e3a5f]/30 transition-all duration-200 bg-gray-50/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">{skill.skillName || "Unnamed skill"}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] border border-[#1e3a5f]/20">
                      {skill.level || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs text-gray-500">Progress</span>
                    <span className="text-xs font-semibold text-gray-700">{Math.min(100, Math.max(0, Number(skill.progress ?? 0)))}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-3 rounded-full bg-[#1e3a5f] transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, Number(skill.progress ?? 0)))}%` }}
                    />
                  </div>
                  {skill.pmNote && skill.pmNote.trim() && (
                    <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-200 italic">
                      {skill.pmNote.trim()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* C) Projects: Active | Completed */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
            <h3 className="text-xl font-bold text-black mb-6">Active Projects</h3>
            {!activeProjects || activeProjects.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No active projects.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {activeProjects.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 bg-gray-50 rounded-xl border border-gray-200"
                  >
                    <span className="font-medium text-gray-900 truncate min-w-0">{p.name || "Unnamed project"}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        {p.status || "In Progress"}
                      </span>
                      <span className="text-sm font-semibold text-[#1e3a5f]">{p.progress ?? 0}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
            <h3 className="text-xl font-bold text-black mb-6">Completed Projects</h3>
            {!completedProjects || completedProjects.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No completed projects.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {completedProjects.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 bg-gray-50 rounded-xl border border-gray-200"
                  >
                    <span className="font-medium text-gray-900 truncate min-w-0">{p.name || "Unnamed project"}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-800 border border-green-200">
                        {p.status || "Completed"}
                      </span>
                      <span className="text-sm text-green-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Done
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* D) Performance History Chart */}
        <section className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
          <div className="flex items-start justify-between mb-6">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-black">Historical Performance Trend</h3>
              <p className="text-sm text-gray-500 font-medium">
                Based on {performanceChartData.length} review{performanceChartData.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f]/10 rounded-lg border border-[#1e3a5f]/20">
              <Target className="w-4 h-4 text-[#1e3a5f]" />
              <span className="text-xs font-semibold text-[#1e3a5f]">Benchmark: {BENCHMARK}%</span>
            </div>
          </div>
          {performanceChartData.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-sm text-gray-600 font-medium">No performance reviews yet.</p>
            </div>
          ) : (
            <div className="w-full min-w-0 overflow-hidden pt-2">
              <PerformanceTrendChart data={performanceChartData} benchmark={BENCHMARK} />
            </div>
          )}
        </section>

        {/* E) Improvement Plan (when performanceScore < 70) */}
        {showImprovementPlan && (
          <section className="bg-amber-50 rounded-xl p-8 shadow-sm border border-amber-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              Improvement Plan
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              Your performance score is below the 70% threshold. Consider the following to improve:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
              <li>Complete pending tasks and raise your completion rate.</li>
              <li>Focus on skill growth in areas aligned with your role.</li>
              <li>Request feedback from your manager and act on it.</li>
              <li>Engage with active projects and deliver on time.</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
