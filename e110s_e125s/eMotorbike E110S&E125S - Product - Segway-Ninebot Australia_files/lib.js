$(document).ready(function ($) {
  // 动画初始化
  if (!(/msie [6|7|8|9]/i.test(navigator.userAgent))) {
    var wow = new WOW({
      boxClass: 'wow',
      animateClass: 'animated',
      offset: 0,
      mobile: true,
      live: true
    });
    wow.init();
  };
  var _winw = $(window).width();
  // 手机导航
  $('.menuBtn').append('<b></b><b></b><b></b>');
  $('.menuBtn').click(function (event) {
    $(this).toggleClass('open');
    $('.nav').stop().slideToggle();
  });
  /* $('.h-lang').hover(function () {
      // over
      $('.lang-box').stop().slideDown()
    }, function () {
      // out
      $('.lang-box').stop().slideUp()
    }
  ); */
  $('.h-lang').on('click', function (e) {
    e.stopPropagation();
    $('.lang-box').stop().slideToggle()
  });
  $('.h-so').on('click', function (e) {
    e.stopPropagation();
    $('.so-pop').stop().slideToggle()
  });
  $('.so-pop').on('click', function (e) {
    e.stopPropagation();
  });
  $('body').on('click', function (e) {
    $('.so-pop').stop().slideUp()
    $('.lang-box').stop().slideUp()
  });

  if (_winw > 1200) {
    $('.nav li').hover(function () {
      $(this).addClass('ok');
      if ($(this).find('.sub').length) {
        $(this).find('.sub').stop().slideDown();
      }
    }, function () {
      $(this).removeClass('ok');
      $(this).find('.sub').stop().slideUp();
    });

  } else {
    $('.nav li').unbind('mouseenter mouseleave')
    $('.nav .v1').click(function () {
      $(this).siblings('.sub').stop().slideToggle().parents('li').toggleClass('on').siblings('li').removeClass('on').find('.sub').stop().slideUp();
      if ($(this).siblings('.sub').length) {
        $(this).attr('href', 'javascript:;')
      }
    });
  }




  // 选项卡 鼠标点击
  $(".TAB_CLICK li").click(function () {
    var tab = $(this).parent(".TAB_CLICK");
    var con = tab.attr("id");
    var on = tab.find("li").index(this);
    $(this).addClass('on').siblings(tab.find("li")).removeClass('on');
    $(con).eq(on).show().siblings(con).hide();
  });
  $('.TAB_CLICK').each(function (index, el) {
    if ($(this).find('li.on').length) {
      $(this).find("li.on").trigger('click');
    } else {
      $(this).find("li").filter(':first').trigger('click');
    }
  });
  /**单选多选 */

  $('[role=radio]').each(function () {
    var input = $(this).find('input[type="radio"]'),
      label = $(this).find('label');

    input.each(function () {
      if ($(this).attr('checked')) {
        $(this).parents('label').addClass('checked');
        $(this).prop("checked", true)
      }
    })

    input.change(function () {
      label.removeClass('checked');
      $(this).parents('label').addClass('checked');
      input.removeAttr('checked');
      $(this).prop("checked", true)
    })
  });

  $('[role=checkbox]').each(function () {
    var input = $(this).find('input[type="checkbox"]');
    input.each(function () {
      if ($(this).attr('checked')) {
        $(this).parents('label').addClass('checked');
        $(this).prop("checked", true);
      }
    });
    input.change(function () {
      $(this).parents('label').toggleClass('checked');
    });
  });
  /**单选多选end */
  // 返回顶部
  $('.g-backtop').click(function (e) {
    e.stopPropagation();
    $("body,html").animate({
      scrollTop: 0
    },
      500);
  });
  // 头部动态加类
  var header = $('.header'),
    headerH = header.height(),
    initScrh = $(window).scrollTop();

  function changeHeader (scrH) {
    if (scrH > headerH) {
      header.addClass('fixed');
    } else {
      header.removeClass('fixed');
    }
  }
  changeHeader(initScrh);
  $(window).on('scroll', function () {
    var _scrH = $(window).scrollTop();
    changeHeader(_scrH);
  });
  // 全屏底部
    function positionFooter() {
        var footer = $(".footer");
        if ((($(document.body).height() + footer.outerHeight()) < $(window).height() && footer.css("position") == "fixed") || ($(document.body).height() < $(window).height() && footer.css("position") != "fixed")) {
            footer.css({
                position: "fixed",
                bottom: "0",
                width: '100%'
            });
        } else {
            footer.css({
                position: "static"
            });
        }
    }

    function stickFooter() {

        window.onload = function () {
            positionFooter()

        }
    }
    stickFooter();
  // 弹窗
  $('.myfancy').click(function (e) {
    e.stopPropagation();
    var _win = $(this).attr('href');
    $(_win).fadeIn();

  });
  $('.pop-bg,.m-pop .close').click(function (e) {
    e.stopPropagation();
    $('.m-pop').fadeOut();
  });
});



