/**
 * [vue_simple.js]
    encoding=utf-8
 */


var _vueApp = function( createVueInstance ){
    var app = createVueInstance({
        el: '#app',
        data: {
            message : "Hello Vue!"
        },
        methods : {
            reverseMessage : function(){
                this.message = this.message.split('').reverse().join('')
            }
        }
    })
};


if( typeof window !== 'undefined' ){
    var CREATE_VUE_INSTANCE = function(options){
        return new Vue(options);
    };
    window.onload = function(){
        _vueApp( CREATE_VUE_INSTANCE );
    };
}else{
    exports.vueApp = _vueApp;
}

