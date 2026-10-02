import { dataProvider } from './services/dataProvider.js';
import { preferenceService } from './services/preferenceService.js';
import { familyService } from './services/familyService.js';

export const APP_VERSION = '2.05';

App<IAppOption>({
  globalData: {
    currentMenu: null,
    version: APP_VERSION,
  },
  onLaunch() {
    console.log(`《四季三餐·好好吃饭》小程序 V${APP_VERSION} 启动中...`);

    // 微信原生云开发环境静默安全初始化
    if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
      try {
        wx.cloud.init({
          env: (wx.cloud as any).DYNAMIC_CURRENT_ENV,
          traceUser: true
        });
      } catch (e) {
        console.warn('微信云开发环境初始化异常:', e);
      }
    }

    dataProvider.init();
    preferenceService.getPreferences();

    // 静默鉴权并同步家庭身份
    familyService.syncUserAuth().catch(err => {
      console.warn('静默鉴权同步异常 (离线模式运行):', err);
    });
  }
});

interface IAppOption {
  globalData: {
    currentMenu: any;
    version: string;
  };
  onLaunch?: () => void;
  [key: string]: any;
}
