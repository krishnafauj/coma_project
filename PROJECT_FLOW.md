# COMA Project - Application Flow Diagram

## 📊 Complete Application Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     APP STARTS HERE                                 │
│                    (Root Layout)                                    │
│              app/_layout.tsx (3-second splash)                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│            MAIN HOME PAGE - index.tsx                               │
│                                                                     │
│  • Title: "Linear Optimization"                                    │
│  • Gradient Background: Blue theme                                 │
│  • Toggle Buttons: [Maximize] / [Minimize]                         │
│  • Input Fields:                                                   │
│    - Number of Variables (n)                                       │
│    - Number of Constraints (m)                                     │
│  • Button: "NEXT" (triggers showing NextComponent)                 │
│                                                                     │
│  State Management:                                                 │
│  - optimization: "Maximize" | "Minimize"                           │
│  - variables: string (numeric)                                     │
│  - constraints: string (numeric)                                   │
│  - showNext: boolean (toggles NextComponent visibility)            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                    (User clicks NEXT)
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│         MATRIX INPUT & CONSTRAINT SETUP - Nextcomponent.tsx        │
│                                                                     │
│  Creates dynamic matrix based on variables × constraints           │
│                                                                     │
│  INPUT SECTIONS:                                                   │
│  ┌──────────────────────────────────────────────────────┐          │
│  │ 1. OBJECTIVE FUNCTION ROW                            │          │
│  │    Inputs: c1, c2, ..., cn (coefficients)           │          │
│  │    Unused: objectiveRHS                              │          │
│  └──────────────────────────────────────────────────────┘          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────┐          │
│  │ 2. CONSTRAINT MATRIX (m × n)                        │          │
│  │    For each row i (i = 1 to m):                     │          │
│  │    - Coefficients: ai1, ai2, ..., ain              │          │
│  │    - RHS Value: bi                                  │          │
│  │    - Constraint Type Picker: ≤ | ≥ | =             │          │
│  └──────────────────────────────────────────────────────┘          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────┐          │
│  │ 3. VARIABLE CONSTRAINTS (n variable sign pickers)   │          │
│  │    For each variable j (j = 1 to n):                │          │
│  │    Sign: ≥0 | ≤0 | unrestricted                    │          │
│  └──────────────────────────────────────────────────────┘          │
│                                                                     │
│  STATE VARIABLES:                                                  │
│  - objectiveRow: string[] (n elements)                             │
│  - constraintRows: string[][] (m × n matrix)                       │
│  - constraintRHS: string[] (m elements)                            │
│  - constraintTypes: string[] (m elements) = ["≤"|"≥"|"="]         │
│  - variableSigns: string[] (n elements) = ["≥0"|"≤0"|"unrestricted"]
│                                                                     │
│  VALIDATION PERFORMED:                                             │
│  ✓ At least one objective coefficient filled                       │
│  ✓ All constraints have at least one coefficient                   │
│  ✓ All RHS values filled                                           │
│  ✓ Warnings for negative RHS values                                │
│  ✓ Detects if Two-Phase method needed                              │
│                                                                     │
│  DECISION LOGIC:                                                   │
│  needsTwoPhaseMethod = ?                                           │
│                                                                     │
│  Check 1: Are there any '≥' or '=' constraints?                   │
│  Check 2: Are there any negative RHS with '≤' constraints?        │
│             (because -ai*x <= -b becomes ai*x >= b)                │
│  Check 3: Are there special variable constraints (≤0 or unres.)?   │
│                                                                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                    (User clicks SOLVE)
                             │
                    Validation & Conversion
                    (strings to numbers)
                             │
                    ┌────────┴────────┐
                    │                 │
           (Two-Phase needed?)        (Standard form OK?)
              YES/TRUE                    NO/FALSE
                    │                     │
                    ↓                     ↓
            ┌───────────────┐     ┌──────────────────┐
            │   NAVIGATE    │     │   NAVIGATE       │
            │    Phase1     │     │   Solution       │
            │               │     │                  │
            │ (Two-Phase    │     │ (Standard        │
            │  Method)      │     │  Simplex)        │
            └───────────────┘     └──────────────────┘
                    │                     │
                    ↓                     ↓
```

---

## 🎯 Path 1: STANDARD SIMPLEX SOLVER (Solution.tsx)

```
┌─────────────────────────────────────────────────────────────────────┐
│            SOLUTION SCREEN - Solution.tsx                           │
│                                                                     │
│  ENTRY CONDITIONS:                                                 │
│  • All constraints are ≤                                           │
│  • All variables are ≥0                                            │
│  • All RHS values are ≥0                                           │
│  • No mixed constraint types                                       │
│                                                                     │
│  RECEIVES FROM Nextcomponent:                                      │
│  - objective: number[] (objective coefficients)                    │
│  - constraintsMatrix: number[][] (constraint coefficients)         │
│  - rhs: number[] (RHS values)                                      │
│  - optType: string ("Maximize" | "Minimize")                       │
│  - constraintTypes: string[] (all "≤")                             │
│  - variableSigns: string[] (all "≥0")                              │
│                                                                     │
│  PROCESSING STEPS:                                                 │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 1. CONVERT TO STANDARD FORM                      │             │
│  │    • Add slack variables for ≤ constraints      │             │
│  │    • Create initial simplex tableau             │             │
│  │    • Setup basis and non-basis variables        │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 2. APPLY SIMPLEX ALGORITHM                       │             │
│  │    • Calculate reduced costs (cj - zj)          │             │
│  │    • Find entering variable (most negative cj)   │             │
│  │    • If none negative → OPTIMAL FOUND           │             │
│  │    • Find leaving variable (min ratio test)      │             │
│  │    • Perform pivot operation                     │             │
│  │    • Repeat until optimal                        │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 3. DISPLAY ITERATIONS                            │             │
│  │    For each iteration:                           │             │
│  │    • Display tableau (all iterations)            │             │
│  │    • Entering/leaving variables                  │             │
│  │    • Current basis and values                    │             │
│  │    • Use decimalToFraction() for readability     │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  OUTPUT RESULTS:                                                   │
│  • Final tableau with all values as fractions                      │
│  • Optimal solution values for each variable                       │
│  • Optimal objective function value                                │
│  • Number of iterations performed                                  │
│                                                                     │
│  BUTTONS AVAILABLE:                                                │
│  • [View Sensitivity Analysis] → Navigate to SensitivityAnalysis   │
│  • [Solve Another Problem] → Navigate back to Home                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        (User clicks "Sensitivity Analysis")
                             │
                             ↓
        ┌────────────────────────────────────────┐
        │     SensitivityAnalysis.tsx            │
        │                                        │
        │  Analyzes optimal solution:            │
        │  • Reduced costs (shadow prices)       │
        │  • Allowable ranges for coefficients   │
        │  • RHS sensitivity                     │
        │                                        │
        │  Options to explore:                   │
        │  [Modify RHS] → RHSChange.tsx         │
        │  [Modify Objective] → ObjectiveChange  │
        └────────────────────────────────────────┘
```

---

## 🎯 Path 2: TWO-PHASE SIMPLEX SOLVER (Phase1 → Phase2)

```
┌─────────────────────────────────────────────────────────────────────┐
│              PHASE 1 SCREEN - Phase1.tsx                            │
│                                                                     │
│  ENTRY CONDITIONS:                                                 │
│  • Has '≥' or '=' constraints, OR                                  │
│  • Has negative RHS values with '≤' constraints, OR                │
│  • Has special variable constraints (≤0 or unrestricted)           │
│                                                                     │
│  RECEIVES FROM Nextcomponent:                                      │
│  - objective: number[] (original objective coefficients)           │
│  - constraintsMatrix: number[][] (constraint coefficients)         │
│  - rhs: number[] (RHS values)                                      │
│  - optType: string ("Maximize" | "Minimize")                       │
│  - constraintTypes: string[] (can have "≤", "≥", "=")             │
│  - variableSigns: string[] (can have "≥0", "≤0", "unrestricted")   │
│                                                                     │
│  PHASE 1 PROCESSING:                                               │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 1. HANDLE SPECIAL CONSTRAINTS                    │             │
│  │    • Negate RHS if negative                      │             │
│  │    • Add artificial variables for ≥ & = constr.  │             │
│  │    • Create Phase 1 objective:                   │             │
│  │      Minimize: Σ(artificial variables)           │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 2. HANDLE VARIABLE TRANSFORMATIONS              │             │
│  │    • For ≤0 variables: substitute x = -y        │             │
│  │    • For unrestricted: x = x+ - x-              │             │
│  │    • Update objective and constraints            │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 3. BUILD PHASE 1 TABLEAU                        │             │
│  │    Original variables + Slack + Artificial       │             │
│  │    Objective: minimize sum of artificial vars    │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 4. APPLY SIMPLEX ALGORITHM (Phase 1)            │             │
│  │    • Calculate reduced costs for Phase 1 obj     │             │
│  │    • Find entering variable                      │             │
│  │    • Find leaving variable (min ratio)           │             │
│  │    • Pivot and continue                          │             │
│  │    • Stop when Phase 1 objective = 0 (optimal)   │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  PHASE 1 COMPLETION CHECK:                                         │
│  ┌─────────────────────────────────────────────────────┐          │
│  │ If Phase 1 Objective Value = 0:                  │          │
│  │ ✓ Feasible solution found                        │          │
│  │ ✓ All artificial variables = 0                   │          │
│  │ ✓ Basic feasible solution exists                 │          │
│  │ → PROCEED TO PHASE 2                             │          │
│  │                                                  │          │
│  │ Else (Phase 1 > 0):                              │          │
│  │ ✗ No feasible solution exists                    │          │
│  │ ✗ Problem is INFEASIBLE                          │          │
│  │ → DISPLAY ERROR & RETURN TO HOME                 │          │
│  └─────────────────────────────────────────────────────┘          │
│                                                                     │
│  DISPLAY PHASE 1 ITERATIONS:                                       │
│  • Show all iterations of Phase 1                                  │
│  • Display basis changes                                           │
│  • Show when artificial variables leave basis                      │
│  • Use fractions for readability                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                (Phase 1 Complete - Feasible)
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│              PHASE 2 SCREEN - Phase2.tsx                            │
│                                                                     │
│  ENTRY CONDITIONS:                                                 │
│  • Receives final basis and tableau from Phase 1                   │
│  • Feasible basic solution has been found                          │
│  • Artificial variables removed or = 0                             │
│                                                                     │
│  RECEIVES FROM Phase1:                                             │
│  - finalTableau: number[][] (Phase 1 optimal tableau)              │
│  - basisVariables: string[] (current basis variables)              │
│  - originalObjective: number[] (original obj. coefficients)        │
│  - And other metadata                                              │
│                                                                     │
│  PHASE 2 PROCESSING:                                               │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 1. SETUP PHASE 2 TABLEAU                        │             │
│  │    • Remove artificial variable columns          │             │
│  │    • Replace Phase 1 objective with             │             │
│  │      ORIGINAL objective function                 │             │
│  │    • Adjust for current basis (reduce costs)     │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐             │
│  │ 2. APPLY SIMPLEX ALGORITHM (Phase 2)            │             │
│  │    • Calculate reduced costs for original obj    │             │
│  │    • Find entering variable (minimize max        │             │
│  │      or maximize max depending on optType)       │             │
│  │    • If none enter → OPTIMAL FOUND              │             │
│  │    • Find leaving variable (min ratio)           │             │
│  │    • Pivot and continue                          │             │
│  └──────────────────────────────────────────────────┘             │
│                                                                     │
│  OUTPUT RESULTS:                                                   │
│  • Final tableau with original objective optimized                 │
│  • Optimal solution values for each variable                       │
│  • Optimal objective function value                                │
│  • Total iterations (Phase 1 + Phase 2)                            │
│  • Status: "Optimal solution found"                                │
│                                                                     │
│  BUTTONS AVAILABLE:                                                │
│  • [View Sensitivity Analysis] → Navigate to SensitivityAnalysis   │
│  • [Solve Another Problem] → Navigate back to Home                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        (User clicks "Sensitivity Analysis")
                             │
                             ↓
        ┌────────────────────────────────────────┐
        │     SensitivityAnalysis.tsx            │
        │                                        │
        │  Same as Path 1 - Analyze solution     │
        │  Options: Modify RHS or Objective      │
        └────────────────────────────────────────┘
```

---

## 📊 HELPER SCREENS & ANALYSIS

### SensitivityAnalysis.tsx
```
ENTRY: Receives final optimal tableau
OUTPUTS OPTIONS:
  • [Analyze RHS Sensitivity] → RHSChange.tsx
  • [Analyze Objective Sensitivity] → ObjectiveChange.tsx
  • [Check New Variable Feasibility] → GeneralSimplexSolver / DualSimplexSolver
```

### RHSChange.tsx
```
PURPOSE: What-if analysis on Right-Hand Side values
ALLOWS:
  • Select which RHS to modify
  • Enter new RHS value
  • Calculate new optimal solution
  • Show shadow prices and allowable ranges
NAVIGATION: Back to SensitivityAnalysis
```

### ObjectiveChange.tsx
```
PURPOSE: What-if analysis on Objective coefficients
ALLOWS:
  • Select which coefficient to modify
  • Enter new coefficient value
  • Calculate new optimal solution
  • Show range of feasibility
NAVIGATION: Back to SensitivityAnalysis
```

### GeneralSimplexSolver.tsx
```
PURPOSE: Alternative simplex implementation
USED FOR:
  • General form problems
  • Alternative solving approach
  • Educational/verification purposes
DISPLAYS: Complete tableau iterations
```

### DualSimplexSolver.tsx
```
PURPOSE: Solve dual problem / Alternative method
USED FOR:
  • Dual problem analysis
  • Sensitivity information
  • Alternative solution approach
DISPLAYS: Dual tableau and solution
```

---

## 🔄 Complete Navigation Map

```
                    ┌─────────────────┐
                    │    APP START    │
                    │  (Splash 3s)    │
                    └────────┬────────┘
                             │
                             ↓
                    ┌─────────────────┐
                    │     HOME        │
                    │ (index.tsx)     │
                    └────────┬────────┘
                             │ [NEXT]
                             ↓
            ┌────────────────────────────────┐
            │   MATRIX INPUT                 │
            │  (Nextcomponent.tsx)           │
            └────────┬────────────┬──────────┘
                     │ [SOLVE]    │
         ┌───────────┴───────────┐│
         │                       ││
    ┌────▼──────┐           ┌───▼────┐
    │ Phase1    │           │Solution │
    │ (Two-Phase)           │         │
    └────┬──────┘           └───┬────┘
         │                      │
    ┌────▼──────┐           ┌───▼────────────────┐
    │ Phase2    │           │ SensitivityAnalysis│
    │           │           │                    │
    └────┬──────┘           └──┬─────────────────┘
         │                     │
         │   ┌─────────────────┼─────────────┐
         │   │                 │             │
         │   ↓                 ↓             ↓
         └──→┌──────────────────────────┐
             │ SensitivityAnalysis      │
             │ (Detailed Analysis)      │
             └──┬──────────────┬────────┘
                │              │
         ┌──────▼───┐   ┌──────▼──────┐
         │ RHSChange│   │ObjectiveChange
         │          │   │
         └──────┬───┘   └──────┬──────┘
                │              │
                └──────┬───────┘
                       │ [Back to Home]
                       ↓
                 ┌──────────────┐
                 │ HOME (Restart)
                 └──────────────┘
```

---

## 🎨 UI Component Hierarchy

```
App Root
└── _layout.tsx (Stack Navigator)
    └── (tabs)/_layout.tsx (Stack within tabs)
        ├── index.tsx (HOME)
        │   └── Nextcomponent (conditionally rendered)
        │       ├── Objective function inputs
        │       ├── Constraint matrix inputs
        │       ├── Constraint type pickers
        │       └── Variable sign pickers
        │
        ├── Solution.tsx (STANDARD SIMPLEX)
        │   ├── Iteration display
        │   ├── Tableau viewer
        │   ├── Results summary
        │   └── Navigation buttons
        │
        ├── Phase1.tsx (TWO-PHASE PART 1)
        │   ├── Phase 1 iterations
        │   ├── Basis tracking
        │   ├── Artificial variable handling
        │   └── Proceed to Phase2
        │
        ├── Phase2.tsx (TWO-PHASE PART 2)
        │   ├── Phase 2 iterations
        │   ├── Original objective optimization
        │   ├── Results summary
        │   └── Navigation buttons
        │
        ├── SensitivityAnalysis.tsx (POST-OPTIMAL)
        │   ├── Shadow prices display
        │   ├── Allowable ranges
        │   ├── Analysis options
        │   └── Navigation to RHS/Objective change
        │
        ├── RHSChange.tsx (WHAT-IF ANALYSIS)
        │   ├── RHS input field
        │   ├── New solution calculation
        │   └── Range of validity display
        │
        ├── ObjectiveChange.tsx (WHAT-IF ANALYSIS)
        │   ├── Coefficient input field
        │   ├── New solution calculation
        │   └── Feasibility range display
        │
        ├── GeneralSimplexSolver.tsx (ALTERNATIVE)
        │   └── Alternative solving approach
        │
        └── DualSimplexSolver.tsx (ALTERNATIVE)
            └── Dual problem solver
```

---

## 📋 Data Flow Summary

### State Variables at Each Stage

**index.tsx (Home)**
```typescript
- optimization: "Maximize" | "Minimize"
- variables: string (e.g., "2")
- constraints: string (e.g., "3")
- showNext: boolean
```

**Nextcomponent.tsx (Matrix Input)**
```typescript
- objectiveRow: string[] (n elements)
- constraintRows: string[][] (m × n)
- constraintRHS: string[] (m elements)
- constraintTypes: string[] (m elements) = ["≤"|"≥"|"="]
- variableSigns: string[] (n elements) = ["≥0"|"≤0"|"unrestricted"]
```

**Solution.tsx / Phase1.tsx → Phase2.tsx**
```typescript
- simplexTable: number[][] (current tableau)
- basisVariables: string[] (current basis)
- iterations: number
- solutions: { [variable: string]: number }
- optimalValue: number
- status: "Optimal" | "Unbounded" | "Infeasible"
```

**SensitivityAnalysis.tsx**
```typescript
- shadowPrices: { [constraint: number]: number }
- reducedCosts: { [variable: string]: number }
- allowableRanges: { [index: number]: [min, max] }
```

---

## ✅ Complete User Journey

1. **Open App** → Splash screen (3 seconds)
2. **Home Page** → Select Max/Min, enter dimensions
3. **Matrix Input** → Enter all coefficients, constraint types, variable signs
4. **Validation** → Check inputs, determine solving method
5. **Solve** → Either:
   - **Path A:** Solution.tsx (standard) → Results
   - **Path B:** Phase1.tsx → Phase2.tsx (two-phase) → Results
6. **Results** → View optimal solution and iterations
7. **Post-Optimal Analysis** → SensitivityAnalysis.tsx
8. **What-If Analysis** → Modify RHS or Objective coefficients
9. **Restart** → Back to home or exit

---

## 🚀 Key Decision Points

| Step | Decision | Condition | Next Screen |
|------|----------|-----------|-------------|
| 1 | Route after matrix input | All ≤, all ≥0 RHS | Solution.tsx |
| 2 | Route after matrix input | Mixed constraints | Phase1.tsx |
| 3 | Phase 1 completion | Sum of artificial = 0 | Phase2.tsx |
| 4 | Phase 1 completion | Sum of artificial > 0 | Infeasible error |
| 5 | Simplex iteration | Negative reduced cost exists | Continue pivoting |
| 6 | Simplex iteration | No negative reduced cost | Optimal found |
| 7 | Simplex iteration | Minimum ratio negative | Unbounded |
| 8 | Results screen | User ready for analysis | SensitivityAnalysis |

---

## 📈 Algorithm Hierarchy

```
Simplex Family
├── Standard Simplex (Solution.tsx)
│   └── Standard Form Only
│       ├── All ≤ constraints
│       ├── All ≥0 variables
│       └── All ≥0 RHS
│
├── Two-Phase Method (Phase1.tsx + Phase2.tsx)
│   ├── Phase 1: Find feasible solution
│   │   ├── Add artificial variables
│   │   └── Minimize sum of artificials
│   └── Phase 2: Optimize original objective
│       └── Remove artificial variables
│
├── General Simplex (GeneralSimplexSolver.tsx)
│   └── Alternative implementation
│
└── Dual Simplex (DualSimplexSolver.tsx)
    └── Dual problem solving
```

This comprehensive flow document covers every screen, every decision point, and every possible path through the COMA application!
