import { registerRootComponent } from 'expo';
import { Root } from './src/App';
import { registerServiceWorker } from './src/pwa';

registerServiceWorker();
registerRootComponent(Root);
