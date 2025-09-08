import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import NextComponent from "./Nextcomponent";

export default function Index() {
  const [optimization, setOptimization] = useState("Maximize");
  const [variables, setVariables] = useState("");
  const [constraints, setConstraints] = useState("");
  const [showNext, setShowNext] = useState(false);

  return (
    <LinearGradient colors={['#4c669f', '#3b5998', '#192f6a']} style={styles.container}>
      <Text style={styles.heading}>Simplex Optimization</Text>
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, optimization === "Maximize" && styles.activeToggle]}
          onPress={() => setOptimization("Maximize")}
        >
          <Text style={[styles.toggleText, optimization === "Maximize" && styles.activeToggleText]}>
            Maximize
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleButton, optimization === "Minimize" && styles.activeToggle]}
          onPress={() => setOptimization("Minimize")}
        >
          <Text style={[styles.toggleText, optimization === "Minimize" && styles.activeToggleText]}>
            Minimize
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Number of Variables</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 2"
          placeholderTextColor="#ccc"
          value={variables}
          onChangeText={setVariables}
        />

        <Text style={styles.label}>Number of Constraints</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 3"
          placeholderTextColor="#ccc"
          value={constraints}
          onChangeText={setConstraints}
        />
      </View>

      <TouchableOpacity style={styles.nextButton} onPress={() => setShowNext(true)}>
        <Text style={styles.nextText}>Next</Text>
      </TouchableOpacity>

      {showNext && (
        <NextComponent
          key={variables + "-" + constraints + "-" + optimization} // forces remount
          optimization={optimization}
          variables={variables}
          constraints={constraints}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "flex-start" },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", textAlign: "center", marginTop: 50 },
  toggleContainer: { flexDirection: "row", justifyContent: "center", marginBottom: 5 },
  toggleButton: { borderWidth: 1, borderColor: "#fff", paddingVertical: 10, paddingHorizontal: 25, borderRadius: 25, marginHorizontal: 5 },
  activeToggle: { backgroundColor: "#fff", color: "#fffff" },
  activeToggleText: {
    color: "#3b5998", // bluish text when active
  },
  toggleText: { color: "#fff", fontWeight: "bold" },
  inputContainer: { marginBottom: 40 },
  label: { color: "#fff", fontSize: 16, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: "#fff", borderRadius: 8, padding: 5, color: "#fff", marginBottom: 5 },
  nextButton: { backgroundColor: "#fff", padding: 15, borderRadius: 30, alignItems: "center" },
  nextText: { color: "#3b5998", fontWeight: "bold", fontSize: 16 },
});