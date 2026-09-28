// Separate startup acceptance fixture. Keep index.ts/App.tsx as the 8/8 Core baseline.
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
console.log('EXPO_STANDARD_STARTUP_REGISTERED');
