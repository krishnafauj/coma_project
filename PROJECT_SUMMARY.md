# COMA Project - Comprehensive Summary

## 📋 Overview

**Project Name:** Linear Optimizer (COMA)  
**Version:** 1.0.0  
**Type:** Cross-Platform Mobile Application  
**Repository:** krishnafauj/coma_project  
**Current Branch:** main  
**Deployment:** Managed with Expo and EAS (Expo Application Services)  

---

## 🎯 Project Purpose

COMA is a sophisticated Linear Programming problem solver application that implements various Simplex algorithm variants to solve optimization problems. It supports:
- **Maximize and Minimize** objective functions
- **Multiple constraint types** (≤, ≥, =)
- **Variable sign constraints** (≥0, ≤0, unrestricted)
- **Multiple solving methods**: Standard Simplex, Two-Phase Simplex, General Simplex, and Dual Simplex

---

## 🏗️ Technology Stack

### Framework & Runtime
- **Framework:** Expo 54.0.19 (React Native)
- **UI Rendering:** React Native
- **Web Support:** React Native Web 0.21.0
- **Navigation:** Expo Router 6.0.13 (File-based routing)
- **Language:** TypeScript 5.9.2
- **Styling:** React Native StyleSheet

### Core Dependencies
```json
{
  "expo": "^54.0.19",
  "react": "^19.1.0",
  "react-native": "^0.81.5",
  "react-dom": "^19.1.0",
  "expo-router": "~6.0.13",
  "typescript": "~5.9.2"
}
```

### UI & Animation Libraries
- **expo-linear-gradient** (~15.0.7) - Gradient backgrounds
- **expo-blur** (~15.0.7) - Blur effects
- **react-native-reanimated** (~4.1.1) - Complex animations
- **react-native-gesture-handler** (~2.28.0) - Gesture recognition
- **react-native-screens** (~4.16.0) - Performance optimization
- **expo-symbols** (~1.0.7) - Icon support

### Navigation & UI Components
- **@react-navigation/native** (^7.1.6)
- **@react-navigation/bottom-tabs** (^7.3.10)
- **@react-navigation/elements** (^2.3.8)
- **@react-native-picker/picker** (2.11.1)
- **expo-web-browser** (~15.0.8)

### Utility Libraries
- **expo-font** (~14.0.9) - Custom font loading
- **expo-image** (~3.0.10) - Optimized image handling
- **expo-linking** (~8.0.8) - Deep linking
- **expo-constants** (~18.0.10) - App constants
- **expo-haptics** (~15.0.7) - Haptic feedback
- **fraction.js** (^5.3.4) - Fraction mathematics
- **@expo/vector-icons** (^15.0.3) - Icon library

### Developer Tools
- **ESLint** (^9.25.0) - Code linting
- **eslint-config-expo** (~10.0.0) - Expo linting config
- **@types/react** (^19.1.10) - React type definitions
- **@babel/core** (^7.25.2) - JavaScript transpiler

---

## 📁 Project Structure

```
coma_project/
├── app/                          # Main application code (Expo Router)
│   ├── _layout.tsx              # Root layout with splash screen
│   ├── (tabs)/                  # Tabbed interface routes
│   │   ├── _layout.tsx          # Tab navigator setup
│   │   ├── index.tsx            # Home - Problem input page
│   │   ├── Nextcomponent.tsx    # Matrix input - coefficients & constraints
│   │   ├── Phase1.tsx           # Two-Phase Simplex Method (Phase 1)
│   │   ├── Phase2.tsx           # Two-Phase Simplex Method (Phase 2)
│   │   ├── Solution.tsx         # Standard Simplex solver
│   │   ├── GeneralSimplexSolver.tsx  # General Simplex implementation
│   │   └── DualSimplexSolver.tsx     # Dual Simplex implementation
│   ├── app.json                 # Expo configuration
│   ├── eas.json                 # EAS build configuration
│   └── expo-env.d.ts            # Type definitions
├── assets/
│   ├── images/                  # App icons, splash screens, app images
│   └── fonts/                   # Custom fonts (SpaceMono-Regular.ttf)
├── package.json                 # npm dependencies & scripts
├── tsconfig.json                # TypeScript configuration
├── eslint.config.js             # ESLint configuration
├── README.md                    # Basic documentation
└── node_modules/                # Installed dependencies
```

---

## 🔄 Application Flow & Architecture

### User Journey

```
1. Index (Home Page)
   └─> User selects: Maximize/Minimize, # of variables, # of constraints
   
2. Nextcomponent (Matrix Input)
   └─> User enters: objective coefficients, constraint matrix, RHS values
   └─> User selects: constraint types (≤,≥,=), variable signs (≥0,≤0,unrestricted)
   └─> System validates inputs
   
3. Route Decision (Based on problem characteristics)
   ├─> Solution.tsx (Standard Simplex)
   │   └─> If: all constraints ≤, all variables ≥0, all RHS ≥0
   │   └─> Direct solution using Simplex tableau method
   │
   └─> Phase1.tsx (Two-Phase Method)
       └─> If: Has ≥/= constraints, special variable constraints, or negative RHS
       └─> Phase 1: Find initial feasible solution using artificial variables
       └─> Phase2.tsx: Optimize original objective function
   
4. Solver Pages
   ├─> GeneralSimplexSolver.tsx (Alternative General Method)
   └─> DualSimplexSolver.tsx (For dual problem solving)
   
5. Results Display
   └─> Optimal solution with tableau iterations and final values
```

---

## 🧮 Key Components & Their Responsibilities

### 1. **index.tsx** (Home Page)
- **Purpose:** Initial problem configuration
- **Inputs:** 
  - Optimization type (Maximize/Minimize)
  - Number of variables (n)
  - Number of constraints (m)
- **UI Features:**
  - Gradient background (expo-linear-gradient)
  - Toggle buttons for Max/Min selection
  - Numeric input fields
- **Output:** Passes to NextComponent for matrix entry

### 2. **Nextcomponent.tsx** (Matrix & Constraints Input)
- **Purpose:** Detailed problem specification
- **Key Features:**
  - Objective function coefficient input
  - Constraint matrix input (m × n)
  - Constraint type selection (≤, ≥, =)
  - Variable sign constraints (≥0, ≤0, unrestricted)
  - Validation logic
  - Smart routing to appropriate solver
- **Validation Includes:**
  - At least one objective coefficient
  - All constraints have coefficients and RHS values
  - Detection of special cases
- **Routing Logic:**
  ```typescript
  if (areAllConstraintsLessOrEqual() && !hasSpecialVariableConstraints() && !hasNegativeRHS) {
    navigate("Solution")  // Standard Simplex
  } else {
    navigate("Phase1")    // Two-Phase Method
  }
  ```

### 3. **Solution.tsx** (Standard Simplex Method)
- **Purpose:** Solve standard form LPs
- **Algorithm:** Simplex Method with Tableau Method
- **Features:**
  - Decimal to fraction conversion for readability
  - Step-by-step iteration display
  - Handles numerical precision issues
  - Displays all tableau iterations
- **Helper Function:** `decimalToFraction()` - Converts decimals to fractions using continued fractions algorithm

### 4. **Phase1.tsx** (Two-Phase Method - Phase 1)
- **Purpose:** Find initial feasible solution for non-standard problems
- **Inputs:** 
  - Original objective function
  - Constraints with mixed types (≤, ≥, =)
  - Variable sign constraints
- **Process:**
  - Adds artificial variables for ≥ and = constraints
  - Creates auxiliary objective function (minimize sum of artificial variables)
  - Solves to find initial basic feasible solution
  - Removes artificial variables if sum = 0 (feasible)
- **Output:** Initial tableau for Phase 2

### 5. **Phase2.tsx** (Two-Phase Method - Phase 2)
- **Purpose:** Optimize original objective starting from feasible solution
- **Inputs:** Initial feasible basis from Phase 1
- **Process:**
  - Uses original objective function
  - Continues simplex iterations from Phase 1 basis
  - Optimizes to find maximum/minimum
- **Output:** Optimal solution with all iterations

### 6. **GeneralSimplexSolver.tsx** (Alternative Method)
- **Purpose:** Alternative simplex implementation with different approach
- **Features:**
  - Generic simplex implementation
  - Handles general form problems
  - Can be used for special cases
- **Use Case:** Fallback or alternative solving method

### 7. **DualSimplexSolver.tsx** (Dual Problem Solver)
- **Purpose:** Solve dual of the primal problem
- **When Used:** 
  - Sensitivity analysis
  - Problems naturally in dual form
  - Computational efficiency for certain structures
- **Features:**
  - Converts primal to dual
  - Applies dual simplex algorithm

---

## 🎨 UI/UX Technologies

### Styling
- **React Native StyleSheet** - Native platform optimization
- **expo-linear-gradient** - Beautiful gradient backgrounds
- **expo-blur** - Blur effects for depth

### Navigation
- **Expo Router** - File-based routing (similar to Next.js)
  - `app/_layout.tsx` - Root navigation structure
  - `app/(tabs)/_layout.tsx` - Tabbed interface
  - File-based automatic route generation

### Interactive Elements
- **TouchableOpacity** - Responsive button touch feedback
- **TextInput** - User input with keyboard management
- **Picker** - Dropdown selections
- **Keyboard Management** - KeyboardAvoidingView for better UX

### Platform Support
- **Android** - Native Android support with adaptive icons
- **iOS** - Native iOS support with SafeAreaContext
- **Web** - Web support via React Native Web

---

## 🔧 Configuration Files

### app.json (Expo Configuration)
```json
{
  "name": "Linear Optimizer",
  "slug": "MyApp",
  "version": "1.0.0",
  "ios": { "supportsTablet": true },
  "android": {
    "package": "com.lucifer_86.MyApp",
    "adaptiveIcon": true,
    "edgeToEdgeEnabled": true
  },
  "web": {
    "bundler": "metro",
    "output": "static"
  },
  "plugins": ["expo-router", "expo-splash-screen"],
  "experiments": { "typedRoutes": true },
  "extra": {
    "eas": {
      "projectId": "3847453b-4d5b-4f17-a7e6-ed7e66e9cd64"
    }
  }
}
```

### tsconfig.json
- **Target:** Strict TypeScript checking enabled
- **Path Aliases:** `@/*` points to root
- **Includes:** All .ts, .tsx files and Expo types

### eslint.config.js
- **Config:** expo/eslint-config-expo
- **Purpose:** Code quality and consistency

### eas.json
- **Purpose:** EAS Build configuration for CI/CD
- **Enables:** Building for iOS and Android without local setup

---

## 🎯 Key Features & Algorithms

### 1. **Simplex Algorithm Implementation**
- **Method:** Tableau-based Simplex Method
- **Features:**
  - Highest coefficient rule for entering variable selection
  - Minimum ratio test for leaving variable selection
  - Degeneracy handling
  - Unbounded/Infeasible detection

### 2. **Two-Phase Method**
- **Phase 1:** Finds initial feasible solution using artificial variables
- **Phase 2:** Optimizes original objective function
- **Handles:** Mixed constraint types and unrestricted variables

### 3. **Variable Constraint Handling**
- **≥0 Constraints:** Standard non-negativity
- **≤0 Constraints:** Variable substitution (y = -x)
- **Unrestricted:** Split into difference of two non-negative variables

### 4. **Numerical Precision**
- **Decimal to Fraction Conversion:** Uses continued fractions algorithm
- **Tolerance Handling:** Treats values < 1e-10 as zero
- **Stability:** Prevents numerical overflow with checks

### 5. **Input Validation**
- Checks for empty inputs
- Validates all coefficients filled
- Detects negative RHS values
- Flags special cases requiring Two-Phase method

---

## 📱 Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **iOS** | ✅ Supported | iPad support enabled |
| **Android** | ✅ Supported | Adaptive icons, edge-to-edge UI |
| **Web** | ✅ Supported | Metro bundler, static output |
| **Expo Go** | ✅ Supported | Development testing |

---

## 🚀 Build & Deployment

### Development Setup
```bash
npm install                  # Install dependencies
npx expo start              # Start dev server
npx expo start --clear      # Clear cache
npx expo start --android    # Android emulator
npx expo start --ios        # iOS simulator
npx expo start --web        # Web preview
```

### Production Build
```bash
eas build --platform android
eas build --platform ios
eas build --platform web
```

### Code Quality
```bash
npm run lint               # Run ESLint
npm run reset-project      # Reset to fresh state
```

---

## 📊 Data Flow Architecture

```
User Input (index.tsx)
        ↓
Matrix & Constraints (Nextcomponent.tsx)
        ↓
Validation & Analysis
        ├─→ All ≤ + All ≥0 RHS ≥0 → Solution.tsx (Standard Simplex)
        └─→ Mixed constraints/signs → Phase1.tsx → Phase2.tsx
        ↓
Simplex Algorithm Execution
        ↓
Tableau Iterations with Fractions
        ↓
Results & Optimal Solution
```

---

## 🔐 Type Safety

- **Full TypeScript:** All components written in TypeScript
- **Type Definitions:** 
  - `RootStackParamList` - Navigation types
  - Component prop interfaces
  - Strict null checks enabled
- **Expo Types:** `expo-env.d.ts` for Expo-specific types

---

## 🎨 Design Pattern

### Component Architecture
- **Functional Components:** React Hooks (useState, useEffect)
- **Navigation:** Expo Router (file-based routing)
- **State Management:** React useState (local component state)
- **Styling:** React Native StyleSheet (platform-specific optimization)

### File Organization
- **Screen Components:** In `app/(tabs)/`
- **Assets:** In `assets/` (images, fonts)
- **Configuration:** Root level (app.json, tsconfig.json, etc.)

---

## 📈 Performance Optimizations

1. **Code Splitting:** File-based routing enables automatic code splitting
2. **Image Optimization:** expo-image for optimized image handling
3. **Navigation:** react-native-screens for reduced memory footprint
4. **Reanimated:** GPU-accelerated animations with react-native-reanimated
5. **Platform-Specific:** Conditional rendering for iOS/Android/Web

---

## 🐛 Error Handling & Edge Cases

### Handled Scenarios
- Empty or invalid coefficient inputs
- Negative RHS values with ≤ constraints
- Unbounded solutions (infinite optimum)
- Infeasible solutions (no feasible region)
- Degenerate cases (cycling prevention)
- Numerical precision issues
- Division by zero in fractions

### Validation
- Input validation before solving
- Constraint type verification
- Variable sign constraint checking
- RHS value checking

---

## 📚 Dependencies Summary

### Production (41 total)
- **Expo Ecosystem:** 15 packages (core, UI, system)
- **React & Navigation:** 5 packages
- **Native Modules:** 5 packages (gesture, animation, screens)
- **Utilities:** 3 packages (fonts, images, icons)
- **Math:** 1 package (fraction.js)

### Development (4 total)
- **TypeScript:** 1 package (^5.9.2)
- **Linting:** 2 packages (ESLint + Expo config)
- **Type Definitions:** 1 package (@types/react)
- **Build:** 1 package (Babel)

---

## 🎯 Recent Changes & Improvements

### Variable Constraint Handling (Recent Update)
- **Improvement:** Enhanced `hasSpecialVariableConstraints()` to include negative RHS detection
- **Impact:** Fixes incorrect routing to Two-Phase method for negative RHS values
- **Result:** More accurate problem classification and appropriate solver selection

---

## 📝 Version Information

- **Expo SDK:** 54.0.19 (Latest)
- **React:** 19.1.0
- **React Native:** 0.81.5
- **TypeScript:** 5.9.2
- **Node Compatibility:** Latest LTS recommended

---

## 🔗 External Resources

- **Expo Documentation:** https://expo.dev
- **Expo Router Docs:** https://expo.dev/router
- **React Native Docs:** https://reactnative.dev
- **EAS Build Docs:** https://docs.expo.dev/build/introduction

---

## 📋 Summary

**COMA** is a comprehensive Linear Programming solver application built with modern React Native and Expo technologies. It provides an intuitive interface for solving optimization problems using multiple simplex algorithm variants. The app supports multiple platforms (iOS, Android, Web) and includes sophisticated constraint handling with proper numerical precision management. The project demonstrates best practices in mobile application development including type safety, platform optimization, and maintainable architecture.

