import { dataProvider } from './services/dataProvider.js';
import { preferenceService } from './services/preferenceService.js';

App<IAppOption>({
  globalData: {
    currentMenu: null,
  },
  onLaunch() {
    console.log('《四季三餐·好好吃饭》小程序启动中...');
    dataProvider.init();
    preferenceService.getPreferences();
  }
});

interface IAppOption {
  globalData: {
    currentMenu: any;
  };
  onLaunch?: () => void;
  [key: string]: any;
}
