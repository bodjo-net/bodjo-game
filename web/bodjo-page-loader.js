(function () {

	const prefix = 'bodjo-page-loader';
	let SERVER_IP = null;
	let stylesheet = null;

	window.loadBodjoPage = function (id, element) {
		if (typeof element === 'string')
			element = document.querySelector(element);

		if (stylesheet == null)
			applyStylesheet();

		if (SERVER_IP == null)
			getServerIP(load);
		else load();

		function load() {
			GET(SERVER_IP + "/pages/load?id=" + id, (status, data) => {
				if (status) {
					if (data.status != 'ok') {
						console.warn(prefix, 'bad api response', data);
					} else {
						if (element.className.indexOf('bodjo-page') < 0)
							element.className += ' bodjo-page';
						element.innerHTML = signature(data.page) + parse(data.page.content);
					}
				} else {
					console.warn(prefix, 'bad http response: ' + data.statusCode + ": " + data.statusText);
				}
			})
		}
	}
	function signature (page) {
		let id = 'u' + Math.round(Math.random() * 9999999);
		GET(SERVER_IP+'/account/info?username='+page.author, (status, data) => {
			let author = document.querySelector('#'+id);
			if (status && data.status == 'ok') {
				let userInfo = data.result[0];
				author.querySelector('.image').style.backgroundImage = 'url("'+userInfo.image["64"]+'")';
			}
			author.className = 'author';
		});
		return ('<div class="signature">'+ 
					'<div class="id">' + page.id + '</div>' +
					'<div class="author loading" id="'+id+'">'+
						'<span class="image"></span>' +
						'<span class="name">'+
							'<span class="username">'+page.author+'</span><br>'+
							'<span class="role">author</span>'+
						'</span>'+
					'</div>'+
					'<div class="info">'+
						'<div class="date">published ' + datestr(page['date-published']) + '</div>' +
						(page['date-edited'] > 0 ? 
							'<div class="date edited">edited ' + datestr(page['date-edited']) + '</div>' : ''
						) +
					'</div>'+
				'</div>'
				);
	}
	function datestr(timestamp) {
		let date = new Date(timestamp);
		return date.toDateString().split(' ').slice(1).join(' ') + ', ' + date.getHours() + ':' + date.getMinutes();

	}
	function parse(string) {
		string = string.replace(/\</g, '&lt;');
		string = string.replace(/\>/g, '&gt;');

		string = string.replace(/\`\`\`(?:\n|\r\n){0,1}((\n|[^`])+)\`\`\`/gm, function (full, content) {
			return ("<pre class='code'>" + 
				content.replace(/\#/g, '&#35;')
					.replace(/\!/g, '&#33;')
					.replace(/\?/g, '&#63;')
					.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
					.replace(/ /g, '&nbsp;')
			 + "</pre>");
		});
		string = string.replace(/\`([^`]+)\`/g, "<span class='code-small'>$1</span>");

		string = string.replace(/^(\#{1,6}) (.+)$/gm, function (full, hashtags, content) {
			return '<h' + hashtags.length + '>'+content+'</h'+hashtags.length+'>';
		});

		string = string.replace(/^(\?|\!) {0,1}\{(?:\n|\r\n){0,1}([^\}]+)(?:\n|\r\n){0,1}\}/gm, function (full, sign, content) {
			return '<div class="'+({'?':'question','!':'warning'})[sign]+'"><span>'+sign+'</span>'+content+'</div>';
		});

		string = string.replace(/((?:^(?:[ \t]*)(?:\-|\d+\.|\w+\.) (?:[^\n\r]+)\n{0,1}){1,})/gm, function (full) {
			return "<ul>" + full.replace(/^([ \t]*)(\-|\d+\.|\w+\.) (.+)(?:\n|\r\n){0,1}/gm, function (full, tabs, marker, content) {
				let style = "", t = (tabs.match(/\t/g)||[]).length;
				if (/^[ixv]+\.$/.test(marker)) {
					style = "list-style: lower-roman;";
				} else if (/^[IXV]+\.$/.test(marker)) {
					style = "list-style: upper-roman;";
				} else if (/^\d+\.$/.test(marker) || /^\w+\.$/.test(marker)) {
					style = 'list-style: none;';
					content = marker + " " + content;
				} else if (t >= 0)
					style = "list-style: "+(['disc','circle','square'])[t%3]+';';
				if (t > 0)
					style += "margin-left: " + t + "em;";
				return "<li style='"+style+"'>"+content+"</li>";
			})+"</ul>";
		});

		string = string.replace(/\!\[([^\]]*)\]\(([^\)]+)\)/g, "<img src='$2' alt='$1'></img>");
		string = string.replace(/(?:\n|\r\n){0,1}\&gt\;\[([^\]]*)\]\(([^\)]+)\)(?:\n|\r\n){0,1}/g, "<img src='$2' class='right' alt='$1'></img>");
		string = string.replace(/(?:\n|\r\n){0,1}\&lt\;\[([^\]]*)\]\(([^\)]+)\)(?:\n|\r\n){0,1}/g, "<img src='$2' class='left' alt='$1'></img>");
		string = string.replace(/\[([^\]]*)\]\(([^\)]+)\)/g, "<a href='$2'>$1</a>");

		string = string.replace(/__([^_]+)__/g, "<i>$1</i>");
		string = string.replace(/\*\*([^\*]+)\*\*/g, "<b>$1</b>");

		string = string.replace(/(?:\n|\r\n)/g, '<br>');
		return string;
	}

	function getServerIP(cb) {
		GET('https://bodjo.net/SERVER_IP', (status, data) => {
			if (status) {
				SERVER_IP = data;
				cb();
			} else {
				console.warn(prefix, 'failed to get server ip, bad http response: ' + data.statusCode + ': ' + data.statusText);
			}
		});
	}

	function applyStylesheet() {
		stylesheet = document.createElement('style');
		stylesheet.innerHTML = '@import url(https://fonts.googleapis.com/css?family=Roboto+Mono:400,700|Source+Code+Pro:400,700&display=swap&subset=cyrillic);.bodjo-page{background:#fff;font-size:100%;font-family:"Source Code Pro","Roboto Mono",Consolas,monospace}.bodjo-page h1,.bodjo-page h2,.bodjo-page h3,.bodjo-page h4,.bodjo-page h5,.bodjo-page h6,.bodjo-page p{margin:0;display:inline-block}.bodjo-page pre.code{background:rgba(0,0,0,.05);border-radius:2px;padding:5px;-moz-tab-size:4;-o-tab-size:4;tab-size:4;display:inline-block;font-size:95%;max-width:100%;box-sizing:border-box;overflow:hidden;word-break:break-all;white-space:normal}.bodjo-page span.code-small{background:rgba(0,0,0,.05);border-radius:2px;padding:2px;display:inline-block;font-size:90%}.bodjo-page div.question,.bodjo-page div.warning{box-sizing:border-box;display:inline-block;min-width:50%;position:relative;border-radius:2px;padding:5px;padding-right:25px}.bodjo-page div.question>span:nth-child(1),.bodjo-page div.warning>span:nth-child(1){position:absolute;top:0;right:0;width:27px;text-align:center;font-weight:700;font-size:150%}.bodjo-page div.warning{background-color:rgba(255,204,128,.5)}.bodjo-page div.warning>span:nth-child(1){color:rgba(127,102,64,1)}.bodjo-page div.question{background-color:rgba(144,202,249,.5)}.bodjo-page div.question>span:nth-child(1){color:rgba(72,101,123,1)}.bodjo-page img.right{margin:10px 0 10px 10px;float:right;max-width:50%}.bodjo-page img.left{margin:10px 10px 10px 0;float:left;max-width:50%}.bodjo-page img{max-width:100%}.bodjo-page ul{margin:0 0 0 5px}.bodjo-page .signature{margin-bottom:10px}.bodjo-page .signature .id{opacity:.5;font-size:75%}.bodjo-page .signature .date{font-style:italic;font-size:60%}.bodjo-page .signature .info{float:right;text-align:right;margin:5px 0}.bodjo-page .signature .author{min-width:100px;display:inline-block;padding:5px 0}.bodjo-page .signature .author span.image{width:25px;height:25px;display:inline-block;background-size:contain;box-shadow:0 1px 3px rgba(0,0,0,.2);border-radius:50%;margin-right:8px}.bodjo-page .signature .author>*{vertical-align:bottom;display:inline-block;line-height:50%}.bodjo-page .signature .author .name .username{margin:0}.bodjo-page .signature .author .name .role{opacity:.5;font-size:60%;margin:0}.bodjo-page .signature .author.loading span.image{background-color:rgba(0,0,0,.1);animation:loadingblink infinite ease-in-out 1s}@keyframes loadingblink{0%{background:rgba(0,0,0,.025)}50%{background:rgba(0,0,0,.075)}100%{background:rgba(0,0,0,.025)}}';
		document.querySelector('head').appendChild(stylesheet);
	}

	function GET(url, callback) {
		let xhr = new XMLHttpRequest();
		if (url.indexOf('http://')!=0&&url.indexOf('https://')!=0)
			url = 'http://'+url;
		xhr.open('GET', url, true);
		xhr.send();
		xhr.onreadystatechange = function () {
			if (xhr.readyState !== 4) return;

			if (xhr.status == 200) {
				let data = xhr.responseText;
				try {
					data = JSON.parse(data);
				} catch (e) {}
				callback(true, data);
			} else {
				callback(false, xhr);
			}

		}
	}
})();