import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View, Image, StyleSheet } from 'react-native'; // <-- Import View, Image, StyleSheet
import { useState, useEffect } from 'react'; // <-- Import useState and useEffect

/**
 * This is your new custom Splash Screen component.
 * It just shows your logo on a black background.
 */
function SplashScreen() {
  return (
    <View style={styles.splashContainer}>
      <Image
        // This path must be relative to THIS file.
        // If your layout file is in 'app/', then '../assets/...' is correct.
        source={require('../assets/images/image.png')} 
        style={styles.splashImage}
        resizeMode="contain" // Ensures your logo scales nicely
      />
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // 1. Keep your font loading
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // 2. Add state to track if the 3-second timer is done
  const [isTimerFinished, setIsTimerFinished] = useState(false);

  // 3. Use an effect to start the 3-second timer
  useEffect(() => {
    const timer = setTimeout(() => {
      // After 3000ms (3 seconds), set isTimerFinished to true
      setIsTimerFinished(true);
    }, 3000);

    // This is a cleanup function. If the component unmounts,
    // it clears the timer to prevent memory leaks.
    return () => clearTimeout(timer);
  }, []); // The empty array [] means this effect runs only once when the app starts

  // 4. Check for both conditions
  // We will show the splash screen until the fonts are loaded AND the timer is finished.
  if (!fontsLoaded || !isTimerFinished) {
    return <SplashScreen />;
  }

  // 5. When both are ready, show the main app
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

// 6. Add the styles for your splash screen
const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: 'black', // Whole black background
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashImage: {
    width: '80%', // Make the logo 80% of the screen width
    // You don't need to set height if you use 'contain'
    // as it will scale automatically.
  },
});