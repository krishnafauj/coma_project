import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { Picker } from '@react-native-picker/picker';
import { useNavigation, NavigationProp } from "@react-navigation/native";

type RootStackParamList = {
  Home: undefined;
  NextComponent: { optimization: string; variables: string; constraints: string };
  Solution: {
    objective: number[];
    constraintsMatrix: number[][];
    rhs: number[];
    optType: string;
    constraintTypes: string[];
  };
  Phase1: {
    objective: number[];
    constraintsMatrix: number[][];
    rhs: number[];
    optType: string;
    constraintTypes: string[];
  };
};

type NextComponentProps = {
  optimization: string;
  variables: string;
  constraints: string;
};

export default function NextComponent({ optimization, variables, constraints }: NextComponentProps) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const numVars = parseInt(variables) || 0;
  const numConstraints = parseInt(constraints) || 0;

  // Objective function row
  const [objectiveRow, setObjectiveRow] = useState<string[]>(Array(numVars).fill(""));
  const [objectiveRHS, setObjectiveRHS] = useState<string>("");

  // Constraints rows
  const [constraintRows, setConstraintRows] = useState<string[][]>(
    Array.from({ length: numConstraints }, () => Array(numVars).fill(""))
  );
  const [constraintRHS, setConstraintRHS] = useState<string[]>(Array(numConstraints).fill(""));
  
  // Constraint types (≤, ≥, =)
  const [constraintTypes, setConstraintTypes] = useState<string[]>(
    Array(numConstraints).fill("≤")
  );

  // Handle changes
  const handleObjectiveChange = (col: number, value: string) => {
    const newRow = [...objectiveRow];
    newRow[col] = value;
    setObjectiveRow(newRow);
  };
  
  const handleObjectiveRHSChange = (value: string) => setObjectiveRHS(value);

  const handleConstraintChange = (row: number, col: number, value: string) => {
    const newRows = [...constraintRows];
    newRows[row][col] = value;
    setConstraintRows(newRows);
  };
  
  const handleConstraintRHSChange = (row: number, value: string) => {
    const newRHS = [...constraintRHS];
    newRHS[row] = value;
    setConstraintRHS(newRHS);
  };

  const handleConstraintTypeChange = (row: number, value: string) => {
    const newTypes = [...constraintTypes];
    newTypes[row] = value;
    setConstraintTypes(newTypes);
  };

  // Check if all constraints are ≤ type
  const areAllConstraintsLessOrEqual = () => {
    return constraintTypes.every(type => type === "≤");
  };

  // Validate inputs
  const validateInputs = () => {
    // Check if objective function is filled
    const hasObjective = objectiveRow.some(val => val.trim() !== "");
    if (!hasObjective) {
      alert("Please enter at least one coefficient for the objective function.");
      return false;
    }

    // Check if all constraint coefficients are filled
    for (let i = 0; i < numConstraints; i++) {
      const hasConstraintCoeff = constraintRows[i].some(val => val.trim() !== "");
      if (!hasConstraintCoeff) {
        alert(`Please enter at least one coefficient for constraint ${i + 1}.`);
        return false;
      }
      
      if (constraintRHS[i].trim() === "") {
        alert(`Please enter RHS value for constraint ${i + 1}.`);
        return false;
      }
    }

    // Check for negative RHS values with ≤ constraints
    for (let i = 0; i < numConstraints; i++) {
      const rhsValue = parseFloat(constraintRHS[i]);
      if (constraintTypes[i] === "≤" && rhsValue < 0) {
        alert(`Constraint ${i + 1} has negative RHS with ≤. This may require special handling.`);
      }
    }

    return true;
  };

  // Handle Solve button
  const handleSolve = () => {
    if (!validateInputs()) {
      return;
    }

    const objective = objectiveRow.map(val => parseFloat(val) || 0);
    const constraintsMatrix = constraintRows.map(row => 
      row.map(val => parseFloat(val) || 0)
    );
    const rhs = constraintRHS.map(val => parseFloat(val) || 0);
    const optType = optimization;

    // Determine which solver to use
    if (areAllConstraintsLessOrEqual()) {
      // All constraints are ≤, go directly to Solution page
      navigation.navigate("Solution", { 
        objective, 
        constraintsMatrix, 
        rhs, 
        optType,
        constraintTypes 
      });
    } else {
      // Has ≥ or = constraints, need Two-Phase method
      navigation.navigate("Phase1", { 
        objective, 
        constraintsMatrix, 
        rhs, 
        optType,
        constraintTypes 
      });
    }
  };

  const getConstraintSymbolColor = (type: string) => {
    switch (type) {
      case "≤": return "#4CAF50"; // Green
      case "≥": return "#FF9800"; // Orange  
      case "=": return "#F44336"; // Red
      default: return "#fff";
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>{optimization} Problem Table</Text>

          <View style={styles.tableContainer}>
            {/* Objective Function Row */}
            <Text style={styles.rowLabel}>Objective Function</Text>
            <View style={styles.row}>
              {objectiveRow.map((cell, colIndex) => (
                <TextInput
                  key={`obj-${colIndex}`}
                  style={styles.cellInput}
                  value={cell}
                  keyboardType="numbers-and-punctuation"
                  placeholder={`x${colIndex + 1}`}
                  placeholderTextColor="#ccc"
                  onChangeText={(value) => handleObjectiveChange(colIndex, value)}
                />
              ))}
              <View style={styles.objectiveRHS}>
                <Text style={styles.equalsSign}>=</Text>
                <TextInput
                  style={[styles.cellInput, styles.rhsInput]}
                  value={objectiveRHS}
                  keyboardType="numbers-and-punctuation"
                  placeholder="Z"
                  placeholderTextColor="#ccc"
                  onChangeText={handleObjectiveRHSChange}
                />
              </View>
            </View>

            {/* Constraint Rows */}
            <Text style={styles.rowLabel}>Constraints</Text>
            {constraintRows.map((row, rowIndex) => (
              <View key={`constraint-${rowIndex}`} style={styles.constraintRow}>
                <View style={styles.row}>
                  {row.map((cell, colIndex) => (
                    <TextInput
                      key={`constraint-${rowIndex}-${colIndex}`}
                      style={styles.cellInput}
                      value={cell}
                      keyboardType="numbers-and-punctuation"
                      placeholder={`x${colIndex + 1}`}
                      placeholderTextColor="#ccc"
                      onChangeText={(value) => handleConstraintChange(rowIndex, colIndex, value)}
                    />
                  ))}
                  
                  {/* Constraint Type Picker */}
                  <View style={styles.constraintTypeContainer}>
                    <Picker
                      selectedValue={constraintTypes[rowIndex]}
                      style={[styles.constraintTypePicker, 
                        { color: getConstraintSymbolColor(constraintTypes[rowIndex]) }]}
                      onValueChange={(value: string) => handleConstraintTypeChange(rowIndex, value)}
                    >
                      <Picker.Item label="≤" value="≤" color="#4CAF50" />
                      <Picker.Item label="≥" value="≥" color="#FF9800" />
                      <Picker.Item label="=" value="=" color="#F44336" />
                    </Picker>
                  </View>
                  
                  <TextInput
                    style={[styles.cellInput, styles.rhsInput]}
                    value={constraintRHS[rowIndex]}
                    keyboardType="numbers-and-punctuation"
                    placeholder="RHS"
                    placeholderTextColor="#ccc"
                    onChangeText={(value) => handleConstraintRHSChange(rowIndex, value)}
                  />
                </View>
                
                {/* Constraint type indicator */}
                <Text style={[styles.constraintIndicator, 
                  { color: getConstraintSymbolColor(constraintTypes[rowIndex]) }]}>
                  Constraint {rowIndex + 1}: {constraintTypes[rowIndex]} type
                  {constraintTypes[rowIndex] !== "≤" && " (Two-Phase required)"}
                </Text>
              </View>
            ))}
          </View>

          {/* Method indicator */}
          <View style={styles.methodIndicator}>
            <Text style={styles.methodText}>
              {areAllConstraintsLessOrEqual() 
                ? "✓ Standard Simplex Method" 
                : "⚠ Two-Phase Method Required"
              }
            </Text>
            {!areAllConstraintsLessOrEqual() && (
              <Text style={styles.methodSubtext}>
                Contains ≥ or = constraints
              </Text>
            )}
          </View>

          {/* Conditions for variables */}
          <View style={styles.conditionsContainer}>
            <Text style={styles.conditionsHeader}>Non-negativity Constraints:</Text>
            {Array.from({ length: numVars }).map((_, i) => (
              <Text key={`condition-${i}`} style={styles.whiteText}>
                x{i + 1} ≥ 0
              </Text>
            ))}
          </View>

          {/* Solve button */}
          <TouchableOpacity 
            style={[styles.solveButton, 
              !areAllConstraintsLessOrEqual() && styles.twoPhaseButton
            ]} 
            onPress={handleSolve}
          >
            <Text style={styles.solveButtonText}>
              {areAllConstraintsLessOrEqual() 
                ? "Solve with Simplex" 
                : "Solve with Two-Phase"
              }
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#3b5998",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heading: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    marginBottom: 10,
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
  },
  constraintRow: {
    marginBottom: 15,
  },
  cellInput: {
    minWidth: 60,
    padding: 10,
    borderWidth: 1,
    borderColor: "#fff",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
    borderRadius: 5,
    marginRight: 5,
  },
  rhsInput: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    fontWeight: "bold",
  },
  objectiveRHS: {
    flexDirection: "row",
    alignItems: "center",
  },
  equalsSign: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginRight: 10,
  },
  constraintTypeContainer: {
    minWidth: 70,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#fff",
    justifyContent: "center",
    marginRight: 10,
  },
  constraintTypePicker: {
    height: 40,
    width: 70,
    color: "#fff",
  },
  constraintIndicator: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 2,
    textAlign: "center",
  },
  methodIndicator: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: "center",
  },
  methodText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  methodSubtext: {
    color: "#FFD54F",
    fontSize: 14,
    marginTop: 5,
  },
  rowLabel: {
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 10,
    fontSize: 16,
  },
  conditionsContainer: {
    marginTop: 10,
    marginBottom: 20,
  },
  conditionsHeader: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 10,
  },
  whiteText: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 5,
  },
  solveButton: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 30,
    alignItems: "center",
    marginTop: 20,
  },
  twoPhaseButton: {
    backgroundColor: "#FF9800",
  },
  solveButtonText: {
    color: "#3b5998",
    fontWeight: "bold",
    fontSize: 16,
  },
});