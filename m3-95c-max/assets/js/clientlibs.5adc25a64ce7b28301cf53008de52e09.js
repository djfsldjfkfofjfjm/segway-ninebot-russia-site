
// JSON data
if (
  typeof window.component_productsitesecondarynavigator_json !== "undefined" &&
  window.component_productsitesecondarynavigator_json.length != 0
) {
  if (document.querySelector(".pdp-topbar-comp")) {
    window.secondoryVue = new Vue({
      el: ".pdp-topbar-comp",
      data() {
        return {
          pdpSecondaryNavigatorObj:
            window.component_productsitesecondarynavigator_json,
          showlistwrap: false,
          listwrapactiveindex: 0, //头部下拉列表选中的index
          wheelup: false,
          righttabactiveindex: 0,
          activeIndex: 0, //默认激活第一个tab
          topbarSelectName: "M95c+",
          showComboboxContent: true,
          displayStyle: "flat",
          topNavElement: null,
          topNavElementHeight: 0,
          topNavElementTop: 0,
          lastScrollTop: 0,
          isClicked: false,
          sections: "", // 页面中所有带有Id的元素
          tabs: "", // 二级导航中所有带clickid的元素
          ids: "",
          buyBtnLink: "",
          isAtBottom: false,
        };
      },
      created() {
        if (this.pdpSecondaryNavigatorObj.productModels.length > 0) {
          const params = new URLSearchParams(window.location.search);
          const myParam = params.get("kid");
          if (myParam == null) {
            this.topbarSelectName =
              this.pdpSecondaryNavigatorObj.productModels[0].websiteModelShortName;
            this.buyBtnLink =
              this.pdpSecondaryNavigatorObj.productModels[0].orderNowUrl;
          } else {
            var selectedModel =
              this.pdpSecondaryNavigatorObj.productModels.find((item) => {
                return item.kid[0] == myParam;
              });
            if (selectedModel != undefined) {
              this.topbarSelectName = selectedModel.websiteModelShortName;
              this.buyBtnLink = selectedModel.orderNowUrl;
              this.listwrapactiveindex =
                this.pdpSecondaryNavigatorObj.productModels.indexOf(
                  selectedModel
                );
            }
          }
        }
      },

      updated() {},

      mounted() {
        $(".pdp-comp").removeAttr("v-cloak");
        this.tabs = document.querySelectorAll(".right-tab span[clickid]");
        for (var i = 0; i < this.tabs.length; i++) {
          if (this.tabs[i].getAttribute("clickid") != "") {
            if (i < this.tabs.length - 1) {
              this.ids =
                this.ids + `#${this.tabs[i].getAttribute("clickid")}, `;
            } else {
              this.ids = this.ids + `#${this.tabs[i].getAttribute("clickid")}`;
            }
          }
        }

        this.topNavElement = document.querySelector(".pdp-topbar-comp");
        document.documentElement.scrollTo({
          top: 0,
          behavior: "smooth",
        });
        var headerElement = document.querySelector(".sec__header_content");
        if (headerElement) {
          this.topNavElementHeight = headerElement.offsetHeight;
          this.topNavElementTop = headerElement.offsetTop;
        }
        // 监听滚动事件
        window.addEventListener("scroll", this.handleScroll);
        //判断左侧内容宽度是否超过720px

        document.addEventListener("touchmove", this.stopMove, {
          passive: false,
        });
        const flatElement = document.querySelector(".flat-display");

        if (flatElement) {
          const elementWidth = flatElement.clientWidth;
          if (elementWidth >= 720) {
            this.displayStyle = "dropDown";
          }
        }
      },

      destroyed() {
        window.removeEventListener("scroll", this.handleScroll);
        document.removeEventListener("touchmove", this.stopMove);
      },

      computed: {},
      methods: {
        stopMove(event) {
          const touch = event.touches[0]; // 获取当前触摸点
          if (this.isAtBottom && touch.clientY < 0) {
            event.preventDefault(); // 阻止默认行为
          }
        },
        switchlistwrap() {
          this.showlistwrap = !this.showlistwrap;
        },

        // righttab点击事件
        handlerighttab(event, i, righttabitem) {
          this.righttabactiveindex = i;
          this.isClicked = true;
          var anchorId =
            righttabitem.expandableItemAnchorID || righttabitem.itemAnchorID;
          const element = document.querySelector("#" + anchorId);
          if (element) {
            var top = 0;
            if (window.innerWidth > 1536) {
              top = element.offsetTop - 150;
            } else if (window.innerWidth > 768) {
              top = (element.offsetTop - 150) * 0.75;
            } else {
              top = element.offsetTop;
            }
            window.scrollTo({
              top: top,
              behavior: "smooth",
            });
          }
        },

        handleactive(menuItem, i) {
          this.showlistwrap = false;
          if (this.topbarSelectName != menuItem.websiteModelShortName) {
            this.topbarSelectName = menuItem.websiteModelShortName;
            this.buyBtnLink = menuItem.orderNowUrl;
            this.listwrapactiveindex = i;

            // 向其它组件传值
            var sku = menuItem.sku;
            if (sku != "") {
              if (typeof window.faqVue == "object") {
                Vue.set(window.faqVue, "selectedProduct", sku);
              }
              if (typeof window.userVoiceVue == "object") {
                Vue.set(window.userVoiceVue, "selectedProduct", sku);
              }
              if (typeof window.downloadVue == "object") {
                Vue.set(window.downloadVue, "selectedProduct", sku);
              }
            }
          }
        },
        handleScroll() {
          const vm = this;
          if (vm.ids !== "") {
            vm.sections = Array.from(document.querySelectorAll(vm.ids));
          }

          const scrollTop =
            window.scrollY || document.documentElement.scrollTop;
          const maxScrollTop = document.body.scrollHeight - window.innerHeight;
          const topNavElement = vm.topNavElement;
          const headerElement = document.querySelector(".sec__header_content");
          const headerMobElement = document.querySelector(
            ".top-nav-mobile-head"
          );

          let headerElementHeight = 0;
          const placeholder = document.querySelector(".placeholder");
          if (headerElement) {
            headerElementHeight = headerElement.offsetHeight;
          }
          let topNavElementHeight = topNavElement.offsetHeight;

          if (scrollTop >= maxScrollTop) {
            this.isAtBottom = true;
          } else {
            this.isAtBottom = false;
          }

          // 判断滚动方向
          if (scrollTop > vm.lastScrollTop) {
            // 向下滚动
            vm.wheelup = false;
            if (vm.isClicked) {
            } else if (scrollTop > 0) {
              headerElement.style.display = "none";
              headerMobElement.style.display = "none";
              headerElement.classList.remove("sec__header_content_fixed");
              headerMobElement.classList.remove("top-nav-mobile-head_fixed");
              topNavElement.classList.add("fixed");
              topNavElement.style.top = 0;
              if (placeholder) {
                placeholder.style.display = "block";
                placeholder.style.height = topNavElementHeight + "px";
              }
            }
          } else {
            // 向上滚动
            vm.wheelup = true;
            if (scrollTop > 0) {
              headerElement.style.display = "block";
              headerMobElement.style.display = "flex";
              headerElement.classList.add("sec__header_content_fixed");
              headerMobElement.classList.add("top-nav-mobile-head_fixed");
              topNavElement.style.top = headerElementHeight + "px";
            } else {
              headerElement.classList.remove("sec__header_content_fixed");
              headerMobElement.classList.remove("top-nav-mobile-head_fixed");
              topNavElement.classList.remove("fixed");
              topNavElement.style.top = 0;
              if (placeholder) {
                placeholder.style.display = "none";
              }
            }
          }

          // 更新上一次滚动位置
          this.lastScrollTop = scrollTop;
          this.isClicked = false;

          // 导航栏联动
          let activeTab = null;

          // 遍历所有的 section，检查当前滚动位置
          if (vm.sections !== "") {
            vm.sections.forEach((section) => {
              const rect = section.getBoundingClientRect();
              // 判断 section 是否进入视口的中间区域
              if (
                  rect.top <= window.innerHeight / 2 &&
                  rect.bottom >= window.innerHeight / 2
              ) {
                activeTab = section.id; // 获取当前 section 的 id
              }
            });
          }


          // 更新导航栏的 active 状态
          if (activeTab != null) {
            vm.tabs.forEach((tab) => {
              if (tab.getAttribute("clickid").trim() === activeTab.trim()) {
                vm.righttabactiveindex = tab.getAttribute("activeKey");
              }
            });
          }
        },
      },
    });
  }
}
