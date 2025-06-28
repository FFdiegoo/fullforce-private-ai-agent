#!/usr/bin/env node

/**
 * Enhanced Dependency Security Audit
 * Checks for vulnerabilities and provides detailed security report
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Starting Enhanced Dependency Security Audit...\n');

async function runNpmAudit() {
  console.log('📦 Running npm audit...');
  
  try {
    // Run npm audit and capture output
    const auditOutput = execSync('npm audit --json', { encoding: 'utf8' });
    const auditData = JSON.parse(auditOutput);
    
    console.log('✅ npm audit completed successfully');
    
    // Parse audit results
    const { vulnerabilities, metadata } = auditData;
    const vulnCount = metadata?.vulnerabilities || 0;
    
    console.log(`📊 Audit Results:`);
    console.log(`   Total vulnerabilities: ${vulnCount.total || 0}`);
    console.log(`   Critical: ${vulnCount.critical || 0}`);
    console.log(`   High: ${vulnCount.high || 0}`);
    console.log(`   Moderate: ${vulnCount.moderate || 0}`);
    console.log(`   Low: ${vulnCount.low || 0}`);
    
    // Show critical and high vulnerabilities
    if (vulnerabilities) {
      const criticalVulns = Object.entries(vulnerabilities)
        .filter(([_, vuln]) => vuln.severity === 'critical' || vuln.severity === 'high')
        .slice(0, 5); // Show top 5
      
      if (criticalVulns.length > 0) {
        console.log('\n🚨 Critical/High Vulnerabilities:');
        criticalVulns.forEach(([name, vuln]) => {
          console.log(`   - ${name}: ${vuln.severity} (${vuln.title})`);
        });
      }
    }
    
    return auditData;
    
  } catch (error) {
    // npm audit returns non-zero exit code when vulnerabilities are found
    if (error.stdout) {
      try {
        const auditData = JSON.parse(error.stdout);
        console.log('⚠️  npm audit found vulnerabilities');
        return auditData;
      } catch (parseError) {
        console.error('❌ Failed to parse npm audit output');
        return null;
      }
    } else {
      console.error('❌ npm audit failed:', error.message);
      return null;
    }
  }
}

async function checkOutdatedPackages() {
  console.log('\n📅 Checking for outdated packages...');
  
  try {
    const outdatedOutput = execSync('npm outdated --json', { encoding: 'utf8' });
    const outdatedData = JSON.parse(outdatedOutput);
    
    const outdatedCount = Object.keys(outdatedData).length;
    console.log(`📊 Outdated packages: ${outdatedCount}`);
    
    if (outdatedCount > 0) {
      console.log('📋 Top outdated packages:');
      Object.entries(outdatedData).slice(0, 5).forEach(([name, info]) => {
        console.log(`   - ${name}: ${info.current} → ${info.latest}`);
      });
    }
    
    return outdatedData;
    
  } catch (error) {
    if (error.stdout) {
      try {
        const outdatedData = JSON.parse(error.stdout);
        return outdatedData;
      } catch (parseError) {
        console.log('✅ All packages are up to date');
        return {};
      }
    } else {
      console.log('✅ All packages are up to date');
      return {};
    }
  }
}

async function analyzePackageJson() {
  console.log('\n📋 Analyzing package.json...');
  
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const dependencies = Object.keys(packageJson.dependencies || {});
    const devDependencies = Object.keys(packageJson.devDependencies || {});
    
    console.log(`📊 Package Analysis:`);
    console.log(`   Dependencies: ${dependencies.length}`);
    console.log(`   Dev Dependencies: ${devDependencies.length}`);
    
    // Check for security-related packages
    const securityPackages = dependencies.filter(dep => 
      dep.includes('security') || 
      dep.includes('helmet') || 
      dep.includes('cors') ||
      dep.includes('rate-limit') ||
      dep.includes('auth')
    );
    
    console.log(`   Security packages: ${securityPackages.length}`);
    if (securityPackages.length > 0) {
      console.log(`   Security deps: ${securityPackages.join(', ')}`);
    }
    
    // Check for potential risky packages
    const riskyPatterns = ['eval', 'exec', 'shell', 'unsafe'];
    const riskyPackages = [...dependencies, ...devDependencies].filter(dep =>
      riskyPatterns.some(pattern => dep.includes(pattern))
    );
    
    if (riskyPackages.length > 0) {
      console.log(`⚠️  Potentially risky packages: ${riskyPackages.join(', ')}`);
    }
    
    return {
      dependencies: dependencies.length,
      devDependencies: devDependencies.length,
      securityPackages,
      riskyPackages
    };
    
  } catch (error) {
    console.error('❌ Failed to analyze package.json:', error.message);
    return null;
  }
}

async function generateSecurityReport(auditData, outdatedData, packageAnalysis) {
  console.log('\n📋 Generating Security Report...');
  
  const report = {
    timestamp: new Date().toISOString(),
    audit: auditData,
    outdated: outdatedData,
    analysis: packageAnalysis,
    recommendations: []
  };
  
  // Generate recommendations
  if (auditData?.metadata?.vulnerabilities?.critical > 0) {
    report.recommendations.push('🚨 CRITICAL: Fix critical vulnerabilities immediately with npm audit fix');
  }
  
  if (auditData?.metadata?.vulnerabilities?.high > 0) {
    report.recommendations.push('⚠️  HIGH: Address high severity vulnerabilities');
  }
  
  if (Object.keys(outdatedData).length > 10) {
    report.recommendations.push('📅 UPDATE: Many packages are outdated, consider updating');
  }
  
  if (!packageAnalysis?.securityPackages?.includes('helmet')) {
    report.recommendations.push('🛡️  SECURITY: Consider adding helmet for security headers');
  }
  
  if (packageAnalysis?.riskyPackages?.length > 0) {
    report.recommendations.push('⚠️  REVIEW: Review potentially risky packages');
  }
  
  // Save report
  const reportPath = path.join(process.cwd(), 'security-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${reportPath}`);
  
  return report;
}

async function runSecurityFixes() {
  console.log('\n🔧 Attempting to fix vulnerabilities...');
  
  try {
    console.log('Running npm audit fix...');
    execSync('npm audit fix', { stdio: 'inherit' });
    console.log('✅ npm audit fix completed');
    
    // Try force fix for remaining issues
    console.log('Running npm audit fix --force...');
    execSync('npm audit fix --force', { stdio: 'inherit' });
    console.log('✅ Force fix completed');
    
  } catch (error) {
    console.log('⚠️  Some vulnerabilities could not be automatically fixed');
    console.log('💡 Manual review may be required');
  }
}

async function main() {
  const auditData = await runNpmAudit();
  const outdatedData = await checkOutdatedPackages();
  const packageAnalysis = await analyzePackageJson();
  
  const report = await generateSecurityReport(auditData, outdatedData, packageAnalysis);
  
  // Determine if we should run fixes
  const criticalVulns = auditData?.metadata?.vulnerabilities?.critical || 0;
  const highVulns = auditData?.metadata?.vulnerabilities?.high || 0;
  
  if (criticalVulns > 0 || highVulns > 0) {
    console.log('\n🔧 Critical/High vulnerabilities found, running fixes...');
    await runSecurityFixes();
    
    // Re-run audit after fixes
    console.log('\n🔍 Re-running audit after fixes...');
    await runNpmAudit();
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🛡️  DEPENDENCY SECURITY REPORT');
  console.log('='.repeat(60));
  
  if (report.recommendations.length === 0) {
    console.log('✅ STATUS: SECURE');
    console.log('🎉 No critical security issues found');
  } else {
    console.log('⚠️  STATUS: NEEDS ATTENTION');
    console.log('📋 Recommendations:');
    report.recommendations.forEach(rec => console.log(`   ${rec}`));
  }
  
  console.log(`📊 Total vulnerabilities: ${auditData?.metadata?.vulnerabilities?.total || 0}`);
  console.log(`📅 Outdated packages: ${Object.keys(outdatedData).length}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runNpmAudit, checkOutdatedPackages, analyzePackageJson };