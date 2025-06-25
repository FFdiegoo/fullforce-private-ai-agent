const fs = require('fs');
const path = require('path');
const { SecurityScanner } = require('../lib/security-scanner');

async function generateSecurityReport() {
  console.log('📋 Generating comprehensive security report...');
  
  try {
    const report = await SecurityScanner.generateSecurityReport();
    const timestamp = new Date().toISOString();
    
    const htmlReport = `
<!DOCTYPE html>
<html>
<head>
    <title>Security Report - ${timestamp}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .score { font-size: 2em; font-weight: bold; }
        .excellent { color: #28a745; }
        .good { color: #17a2b8; }
        .fair { color: #ffc107; }
        .poor { color: #dc3545; }
        .vulnerability { margin: 10px 0; padding: 10px; border-left: 4px solid; }
        .high { border-color: #dc3545; background: #f8d7da; }
        .medium { border-color: #ffc107; background: #fff3cd; }
        .low { border-color: #17a2b8; background: #d1ecf1; }
        .recommendations { background: #e7f3ff; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Report</h1>
        <p>Generated: ${timestamp}</p>
        <div class="score ${report.overall.status.toLowerCase()}">
            Overall Score: ${report.overall.score}/100 (${report.overall.status})
        </div>
        <p>Critical Issues: ${report.overall.criticalIssues}</p>
    </div>
    
    <h2>📦 Dependencies Security</h2>
    <p>Score: ${report.dependencies.score}/100</p>
    <p>Vulnerabilities Found: ${report.dependencies.vulnerabilities.length}</p>
    
    ${report.dependencies.vulnerabilities.map(v => `
        <div class="vulnerability ${v.type.toLowerCase()}">
            <strong>${v.category}</strong>: ${v.description}<br>
            <em>Recommendation: ${v.recommendation}</em>
        </div>
    `).join('')}
    
    <h2>💻 Code Security</h2>
    <p>Score: ${report.code.score}/100</p>
    <p>Vulnerabilities Found: ${report.code.vulnerabilities.length}</p>
    
    ${report.code.vulnerabilities.map(v => `
        <div class="vulnerability ${v.type.toLowerCase()}">
            <strong>${v.category}</strong>: ${v.description}<br>
            <em>Recommendation: ${v.recommendation}</em>
        </div>
    `).join('')}
    
    <h2>💡 Recommendations</h2>
    <div class="recommendations">
        <ul>
            ${report.overall.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
</body>
</html>
    `;
    
    const reportPath = path.join(process.cwd(), 'security-report.html');
    fs.writeFileSync(reportPath, htmlReport);
    
    console.log(`✅ Security report generated: ${reportPath}`);
    console.log(`📊 Overall Score: ${report.overall.score}/100 (${report.overall.status})`);
    
  } catch (error) {
    console.error('❌ Failed to generate security report:', error);
    process.exit(1);
  }
}

generateSecurityReport();