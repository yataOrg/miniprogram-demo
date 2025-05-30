Page({
  onShareAppMessage() {
    return {
      title: 'WXML节点布局相交状态',
      path: 'packageAPI/pages/page/intersection-observer/intersection-observer'
    }
  },

  data: {
    theme: 'light',
    appear: false
  },
  onUnload() {
    if (wx.offThemeChange) {
      wx.offThemeChange()
    }
    if (this._observer) this._observer.disconnect()
  },
  onLoad() {
    this.setData({
      theme: getApp().globalData.theme || 'light'
    })

    if (wx.onThemeChange) {
      wx.onThemeChange(({ theme }) => {
        this.setData({ theme })
      })
    }
    this._observer = wx.createIntersectionObserver(this)
    this._observer
      .relativeTo('.scroll-view')
      .observe('.ball', (res) => {
        console.log(res)
        this.setData({
          appear: res.intersectionRatio > 0
        })
      })
  }
})
