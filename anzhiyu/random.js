var posts=["2024/10/15/利用termux实现免root的code-server/","2024/10/06/在手机上打造随身开发环境：Termux与code-server的完美结合/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };