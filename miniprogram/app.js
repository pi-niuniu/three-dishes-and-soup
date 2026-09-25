import { dataProvider } from './services/dataProvider.js';
import { preferenceService } from './services/preferenceService.js';
App({
    globalData: {
        currentMenu: null,
    },
    onLaunch() {
        console.log('《一年四季·好好吃饭》小程序启动中...');
        dataProvider.init();
        preferenceService.getPreferences();
    }
});
