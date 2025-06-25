const { SecurityScanner } = require('../lib/security-scanner');

async function runSecurityScan() {
  console.log('🔍 Starting security scan...');
  
  try {
    const report = await SecurityScanner.generateSecurityReport();
    
    console.log('\n📊 Security Report');
    console.log('==================');
    console.log(`Overall Score: ${report.overall.score}/100 (${report.overall.status})`);
    console.log(`Critical Issues: ${report.overall.criticalIssues}`);
    
    console.log('\n📦 Dependencies:');
    console.log(`Score: ${report.dependencies.score}/100`);
    console.log(`Vulnerabilities: ${report.dependencies.vulnerabilities.length}`);
    
    console.log('\n💻 Code Security:');
    console.log(`Score: ${report.code.score}/100`);
    console.log(`Vulnerabilities: ${report.code.vulnerabilities.length}`);
    
    if (report.overall.criticalIssues > 0) {
      console.log('\n🚨 Critical Issues Found:');
      [...report.dependencies.vulnerabilities, ...report.code.vulnerabilities]
        .filter(v => v.type === 'HIGH')
        .forEach(v => {
          console.log(`- ${v.category}: ${v.description}`);
        });
    }
    
    console.log('\n💡 Recommendations:');
    report.overall.recommendations.slice(0, 5).forEach(rec => {
      console.log(`- ${rec}`);
    });
    
    // Exit with error code if critical issues found
    if (report.overall.criticalIssues > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Security scan failed:', error);
    process.exit(1);
  }
}

runSecurityScan();