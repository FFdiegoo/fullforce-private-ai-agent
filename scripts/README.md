# Scripts Directory

This directory contains essential utility scripts for the Full Force AI project.

## Available Scripts

### Environment & Database
- `check-env.js` - Validates environment variables configuration
- `verify-database.js` - Comprehensive database verification
- `verify-schema-compliance.js` - Supabase schema compliance checker

## Removed Scripts (Cleanup 2025-01-28)

The following scripts were removed during repository cleanup to eliminate conflicts and improve maintainability:

### Bulk Upload Scripts (Removed)
- `bulk-upload-d-drive.js` - Bulk upload from D: drive
- `setup-supabase-structure.js` - Supabase structure setup
- `process-unindexed-documents.ts` - Document processing pipeline
- `test-document-processing.ts` - Document processing tests

### Security & Testing Scripts (Removed)
- `security-scan.js` - Security vulnerability scanning
- `security-report.js` - Security report generation
- `dependency-audit.js` - Dependency security audit
- `test-security.js` - Security testing suite

### Deployment & Production Scripts (Removed)
- `production-deploy.js` - Production deployment automation
- `final-testing.js` - Comprehensive testing suite
- `setup-cron-job.js` - CRON job configuration

### Database Scripts (Removed)
- `setup-database.js` - Database initialization
- `prisma-sync-check.js` - Prisma/Supabase sync checker

## Usage

Run scripts from the project root:

```bash
# Check environment configuration
npm run env:check

# Verify database setup
npm run db:verify
```

## Notes

- All scripts are designed to be run from the project root directory
- Environment variables must be configured in `.env.local`
- Database scripts require valid Supabase credentials