var posts=["2024/10/15/利用termux实现免root的code-server/","2024/10/06/在手机上打造随身开发环境：Termux与code-server的完美结合/","2024/11/12/2024-11-12随笔/","2024/11/16/2024-11-16随笔/","2024/11/16/U-Net-学习总结/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };