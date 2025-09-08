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
import { useNavigation, NavigationProp } from "@react-navigation/native";

type RootStackParamList = {
  Home: undefined;
  NextComponent: { optimization: string; variables: string; constraints: string };
  Solution: {
    objective: number[];
    constraintsMatrix: number[][];
    rhs: number[];
    optType: string;
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

  // Handle Solve button
  const handleSolve = () => {
    const objective = objectiveRow.map(Number);
    const constraintsMatrix = constraintRows.map(row => row.map(Number));
    const rhs = constraintRHS.map(Number);
    const optType = optimization;

    navigation.navigate("Solution", { objective, constraintsMatrix, rhs, optType });
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
              <TextInput
                style={[styles.cellInput, styles.rhsInput]}
                value={objectiveRHS}
                keyboardType="numbers-and-punctuation"
                placeholder="RHS"
                placeholderTextColor="#ccc"
                onChangeText={handleObjectiveRHSChange}
              />
            </View>

            {/* Constraint Rows */}
            <Text style={styles.rowLabel}>Constraints</Text>
            {constraintRows.map((row, rowIndex) => (
              <View key={`constraint-${rowIndex}`} style={styles.row}>
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
                <TextInput
                  style={[styles.cellInput, styles.rhsInput]}
                  value={constraintRHS[rowIndex]}
                  keyboardType="numbers-and-punctuation"
                  placeholder="RHS"
                  placeholderTextColor="#ccc"
                  onChangeText={(value) => handleConstraintRHSChange(rowIndex, value)}
                />
              </View>
            ))}
          </View>

          {/* Conditions for variables */}
          <View style={styles.conditionsContainer}>
            {Array.from({ length: numVars }).map((_, i) => (
              <Text key={`condition-${i}`} style={styles.whiteText}>
                x{i + 1} ≥ 0
              </Text>
            ))}
          </View>

          {/* Solve button */}
          <TouchableOpacity style={styles.solveButton} onPress={handleSolve}>
            <Text style={styles.solveButtonText}>Solve</Text>
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
  solveButtonText: {
    color: "#3b5998",
    fontWeight: "bold",
    fontSize: 16,
  },
});