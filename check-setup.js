#!/usr/bin/env node

/**
 * Setup Verification Script
 * ==========================
 * 
 * Description:
 * This script performs comprehensive validation of the Lost & Found system setup.
 * It checks for required files, dependencies, and directories before allowing
 * the server to start. This ensures all necessary components are in place.
 * 
 * Usage:
 * node verify-setup.js
 * or
 * npm run verify
 * 
 * Exit Codes:
 * - 0: All checks passed successfully
 * - 1: One or more checks failed
 * 
 * Checks Performed:
 * 1. Node.js version verification
 * 2. Required file existence and size
 * 3. CSS content validation
 * 4. npm dependencies installation status
 * 5. Specific package verification
 * 6. Directory structure validation
 */

const fs = require('fs');
const path = require('path');

/**
 * COLOR CODES FOR TERMINAL OUTPUT
 * Used to make output more readable in the terminal
 */
const COLORS = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m'
};

/**
 * Log an informational message
 * 
 * @param {string} message - The message to log
 */
function logInfo(message) {
  console.log(`${COLORS.BLUE}INFO${COLORS.RESET}: ${message}`);
}

/**
 * Log a success message with checkmark
 * 
 * @param {string} message - The success message to log
 */
function logSuccess(message) {
  console.log(`${COLORS.GREEN}[OK]${COLORS.RESET} ${message}`);
}

/**
 * Log an error message with X mark
 * 
 * @param {string} message - The error message to log
 */
function logError(message) {
  console.log(`${COLORS.RED}[FAIL]${COLORS.RESET} ${message}`);
}

/**
 * Log a warning message
 * 
 * @param {string} message - The warning message to log
 */
function logWarning(message) {
  console.log(`${COLORS.YELLOW}[WARN]${COLORS.RESET} ${message}`);
}

/**
 * Print a section header for better organization
 * 
 * @param {string} title - The title of the section
 */
function printSectionHeader(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${title}`);
  console.log(`${'='.repeat(60)}`);
}

/**
 * MAIN VERIFICATION SCRIPT
 * ========================
 */

console.log('\n');
console.log('*'.repeat(60));
console.log('     LOST & FOUND SYSTEM - SETUP VERIFICATION');
console.log('*'.repeat(60));

// Track overall status - set to false if any check fails
let allGood = true;

// ============================================
// SECTION 1: Node.js VERSION CHECK
// ============================================
printSectionHeader('1. ENVIRONMENT CHECK');

const nodeVersion = process.version;
logSuccess(`Node.js version: ${nodeVersion}`);

// ============================================
// SECTION 2: REQUIRED FILES CHECK
// ============================================
printSectionHeader('2. REQUIRED FILES CHECK');

/**
 * List of files that must exist for the application to function
 * Each file is critical to the application's operation
 */
const requiredFiles = [
  {
    path: 'server.js',
    description: 'Main Express server file'
  },
  {
    path: 'package.json',
    description: 'Node.js project metadata and dependencies'
  },
  {
    path: 'views/index.ejs',
    description: 'Homepage template'
  },
  {
    path: 'views/browse.ejs',
    description: 'Browse items page template'
  },
  {
    path: 'views/uploadItem.ejs',
    description: 'Item upload form template'
  },
  {
    path: 'views/claim.ejs',
    description: 'Claim item form template'
  },
  {
    path: 'views/admin.ejs',
    description: 'Admin dashboard template'
  },
  {
    path: 'public/styles.css',
    description: 'Application stylesheet'
  }
];

console.log('Verifying required files:\n');

/**
 * Check each required file for existence
 * If file exists, also display its size for informational purposes
 */
requiredFiles.forEach(file => {
  const fullPath = path.join(__dirname, file.path);
  
  if (fs.existsSync(fullPath)) {
    try {
      const stats = fs.statSync(fullPath);
      const sizeInKB = (stats.size / 1024).toFixed(2);
      logSuccess(`${file.path} (${sizeInKB} KB) - ${file.description}`);
    } catch (error) {
      logError(`${file.path} - Could not read file stats`);
      allGood = false;
    }
  } else {
    logError(`${file.path} - MISSING! Required for: ${file.description}`);
    allGood = false;
  }
});

// ============================================
// SECTION 3: CSS CONTENT VALIDATION
// ============================================
printSectionHeader('3. STYLESHEET VALIDATION');

const stylesPath = path.join(__dirname, 'public/styles.css');

/**
 * Check if styles.css exists and has sufficient content
 * Empty or minimal CSS files could indicate incomplete setup
 */
if (fs.existsSync(stylesPath)) {
  try {
    const content = fs.readFileSync(stylesPath, 'utf8');
    const characterCount = content.length;
    
    if (characterCount > 100) {
      logSuccess(`styles.css has valid content (${characterCount} characters)`);
    } else {
      logError('styles.css is empty or too small (less than 100 characters)');
      logInfo('Please ensure the stylesheet contains CSS rules');
      allGood = false;
    }
  } catch (error) {
    logError(`styles.css - Could not read file: ${error.message}`);
    allGood = false;
  }
} else {
  logWarning('styles.css not found - stylesheet validation skipped');
}

// ============================================
// SECTION 4: DEPENDENCIES CHECK
// ============================================
printSectionHeader('4. DEPENDENCIES CHECK');

console.log('Checking npm modules:\n');

/**
 * Core dependencies required by the application
 * These packages handle key functionality:
 * - express: Web framework for routing and middleware
 * - ejs: Template engine for rendering HTML
 * - sqlite3: Database driver for SQLite
 * - multer: File upload and form data handling
 * - dotenv: Environment variable configuration
 */
const requiredPackages = [
  {
    name: 'express',
    description: 'Web application framework'
  },
  {
    name: 'ejs',
    description: 'Templating engine for views'
  },
  {
    name: 'sqlite3',
    description: 'SQLite database driver'
  },
  {
    name: 'multer',
    description: 'File upload middleware'
  },
  {
    name: 'dotenv',
    description: 'Environment variable loader'
  }
];

const nodeModulesPath = path.join(__dirname, 'node_modules');

/**
 * First check if node_modules directory exists
 * If it doesn't exist, npm install has not been run
 */
if (fs.existsSync(nodeModulesPath)) {
  logSuccess('node_modules directory exists');

  /**
   * Check for each required package
   * Verifies that each dependency has been installed
   */
  console.log('\nVerifying installed packages:\n');
  
  requiredPackages.forEach(pkg => {
    const pkgPath = path.join(nodeModulesPath, pkg.name);
    
    if (fs.existsSync(pkgPath)) {
      logSuccess(`${pkg.name} - ${pkg.description}`);
    } else {
      logError(`${pkg.name} - NOT installed (${pkg.description})`);
      allGood = false;
    }
  });
} else {
  logError('node_modules directory NOT found');
  logInfo('Run: npm install');
  console.log('\nThis command will:');
  console.log('  • Download all required packages');
  console.log('  • Create node_modules directory');
  console.log('  • Generate package-lock.json');
  allGood = false;
}

// ============================================
// SECTION 5: DIRECTORY STRUCTURE CHECK
// ============================================
printSectionHeader('5. DIRECTORY STRUCTURE CHECK');

console.log('Checking required directories:\n');

/**
 * Directory structure required by the application
 * These directories store application data and static files
 */
const requiredDirs = [
  {
    path: 'public',
    description: 'Static files (CSS, JS, images)',
    critical: true
  },
  {
    path: 'views',
    description: 'EJS template files',
    critical: true
  },
  {
    path: 'public/uploads',
    description: 'User-uploaded item images',
    critical: false,
    note: 'Will be created automatically on first use'
  }
];

/**
 * Check each directory
 * Some directories are critical and must exist
 * Others can be created automatically at runtime
 */
requiredDirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir.path);
  
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      logSuccess(`${dir.path}/ exists - ${dir.description}`);
    } else {
      logError(`${dir.path} exists but is not a directory`);
      allGood = false;
    }
  } else {
    if (dir.critical) {
      logError(`${dir.path}/ - MISSING (${dir.description})`);
      allGood = false;
    } else {
      logWarning(`${dir.path}/ - Not yet created (${dir.note})`);
    }
  }
});

// ============================================
// SECTION 6: FINAL VERDICT
// ============================================
printSectionHeader('VERIFICATION RESULT');

if (allGood) {
  console.log(`\n${COLORS.GREEN}SUCCESS: All checks passed!${COLORS.RESET}\n`);
  console.log('The system is ready to run. Start the server with:\n');
  console.log(`  ${COLORS.BLUE}npm start${COLORS.RESET}\n`);
  console.log('The server will be available at:');
  console.log(`  ${COLORS.BLUE}http://localhost:3000${COLORS.RESET}\n`);
  console.log('Available pages:');
  console.log(`  • Homepage: http://localhost:3000/`);
  console.log(`  • Submit Item: http://localhost:3000/upload`);
  console.log(`  • Browse Items: http://localhost:3000/browse`);
  console.log(`  • Claim Item: http://localhost:3000/claim`);
  console.log(`  • Admin Panel: http://localhost:3000/admin\n`);
} else {
  console.log(`\n${COLORS.RED}FAILURE: Some checks did not pass!${COLORS.RESET}\n`);
  console.log('Please fix the issues listed above before starting the server.\n');
  console.log('COMMON SOLUTIONS:\n');
  
  console.log('1. Install dependencies:');
  console.log(`   ${COLORS.BLUE}npm install${COLORS.RESET}\n`);
  
  console.log('2. Get the latest files (if using git):');
  console.log(`   ${COLORS.BLUE}git pull origin main${COLORS.RESET}\n`);
  
  console.log('3. Verify you are in the correct project directory:');
  console.log(`   ${COLORS.BLUE}pwd${COLORS.RESET} (on macOS/Linux)`);
  console.log(`   ${COLORS.BLUE}cd${COLORS.RESET} (on Windows)\n`);
  
  console.log('4. If problems persist, check:');
  console.log(`   • That Node.js is properly installed`);
  console.log(`   • That you have read permissions for all files`);
  console.log(`   • That your disk has sufficient free space\n`);
}

console.log('='.repeat(60) + '\n');

/**
 * Exit with appropriate code
 * Exit code 0 indicates success
 * Exit code 1 indicates failure
 * This allows scripts to detect if setup is valid
 */
process.exit(allGood ? 0 : 1);