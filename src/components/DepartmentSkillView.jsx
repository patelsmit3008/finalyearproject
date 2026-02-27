import { Award, Lock, CheckCircle2 } from 'lucide-react';
import { calculateExperience } from '../utils/dateUtils';

/**
 * DepartmentSkillView - Displays department-wise employee skills
 * Shows employees grouped by department with their skills, Helix points, and experience
 */
const DepartmentSkillView = ({ employeesWithSkills }) => {
  // Group employees by department
  const employeesByDepartment = employeesWithSkills.reduce((acc, employee) => {
    if (!acc[employee.department]) {
      acc[employee.department] = [];
    }
    acc[employee.department].push(employee);
    return acc;
  }, {});

  // Calculate current experience for an employee
  const getCurrentExperience = (joinDate) => {
    return calculateExperience(joinDate);
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Department-Wise Employee Skills</h2>
        <p className="text-sm text-gray-600">View employee skills, eligibility, and experience by department</p>
      </div>

      {Object.entries(employeesByDepartment).map(([department, deptEmployees]) => (
        <div key={department} className="bg-white rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{department} Department</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deptEmployees.map((employee) => {
              const currentExperience = getCurrentExperience(employee.joinDate);
              
              return (
                <div
                  key={employee.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  {/* Employee Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                        {employee.avatar}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{employee.name}</h4>
                        <p className="text-xs text-gray-500">{employee.department}</p>
                      </div>
                    </div>
                  </div>

                  {/* Helix Points - Highlighted */}
                  <div className="mb-4 p-3 bg-indigo-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-medium text-gray-600">Helix Points:</span>
                      <span className="text-lg font-bold text-indigo-600">
                        {employee.helixPoints.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Experience */}
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Current Experience:</span>
                      <span className="font-semibold text-gray-900">{currentExperience} years</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Previous Experience:</span>
                      <span className="font-semibold text-gray-900">{employee.previousExperience} years</span>
                    </div>
                  </div>

                  {/* Technology Stack / Skills */}
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Technology Stack:</p>
                    <div className="flex flex-wrap gap-2">
                      {employee.skills.map((skill, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${
                            skill.enabled
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-gray-50 text-gray-500 border border-gray-200'
                          }`}
                        >
                          {skill.enabled ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Lock className="w-3 h-3" />
                          )}
                          <span>{skill.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
};

export default DepartmentSkillView;

