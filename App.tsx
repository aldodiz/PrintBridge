/**
 * Print Bridge — puente de impresión USB para Pancherías Cuaqu.
 * Ver README.md para el contexto completo (Paso 24).
 *
 * @format
 */

import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <HomeScreen />
    </SafeAreaProvider>
  );
}

export default App;
