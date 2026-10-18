import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#101828',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#f8fafc' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'PDF Signer' }} />
        <Stack.Screen name="reader/[id]" options={{ title: 'Pembaca PDF' }} />
        <Stack.Screen name="sign/[id]" options={{ title: 'Tanda Tangani' }} />
        <Stack.Screen
          name="signatures"
          options={{ title: 'Pustaka Tanda Tangan' }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
