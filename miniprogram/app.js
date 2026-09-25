import { dataProvider } from './services/dataProvider.js';
import { preferenceService } from './services/preferenceService.js';
export const APP_VERSION = '2.04';
App({
    globalData: {
        currentMenu: null,
        version: APP_VERSION,
    },
    onLaunch() {
        console.log(`《四季三餐·好好吃饭》小程序 V${APP_VERSION} 启动中...`);
        dataProvider.init();
        preferenceService.getPreferences();
    }
});
