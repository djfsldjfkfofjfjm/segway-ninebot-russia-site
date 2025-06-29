(function($){
    //显示搜索按钮
    function showHeaderSearch(){
        var _headerWhiteWrap = $('#headerWhiteWrap'),
            _btnShowSearch = _headerWhiteWrap.find('#iconSearch'),
            _form = _headerWhiteWrap.find('#searchForm'),
            _btnClose = _headerWhiteWrap.find('#btnSearchClose'),
            _inputValue = _headerWhiteWrap.find('#searchValue'),
            _active = 'show-it';

        //显示搜索框
        _btnShowSearch.on('click', function(){
            _form.addClass(_active);
        });
        //隐藏搜索框
        _btnClose.on('click', function(){
            _form.removeClass(_active);
        });
        //搜索事件
        _inputValue.on('keypress', function(e){
            if(e.keyCode==13){
                console.log("search:", $(this).val());
                //ajax do something...
            }
            //if end
        });
    }

    var wow = new WOW({
        boxClass: 'wow',
        animateClass: 'animated',
        offset: 0,
        mobile: true,
        live: true
    });

    $(function(){
        //顶部搜索事件
        showHeaderSearch();

        //当页面大于等导航高度时
        $('body').setFixedBody({
            active: 'fixed',
            topHeight : 120
        });

        //底部列表展开
        $('.column-box dl').showMobileBottom({
            touchNavTag: "dt",
            contentTag: "dd.animated"
        });

        //小导航显示与隐藏
        $('#mobileHeadBtn').showMobileNav({
            navList: '#mobileHeadList'
        });

        //返回顶部
        $('#up2TopBtn').up2Top();

        //监听滚动事件
        $('html, body').mouseWheelScroll(function(e){
            var _scrollTop  = $(window).scrollTop(),
                _mobileHeadList = $('#mobileHeadList'),
                _body = $('body'),
                _active = "fixed-up";
            //向上
            if(_scrollTop>90&&e.deltaY<0){
                _body.addClass(_active);
            }
            //向下
            else if(_body.hasClass(_active)){
                _body.removeClass(_active);
                if($.isMobile()&&!_mobileHeadList.is(':hidden')){
                    _mobileHeadList.slideUp();
                }
            }
            //if end
        });

        //窗体大小改变
        $(window).resize(function(){
            var _mobileHeadList = $('#mobileHeadList');
            if(!$.isMobile()&&_mobileHeadList.is(':hidden')){
                _mobileHeadList.show();
            }
        });


        wow.init();
    });
})(jQuery);