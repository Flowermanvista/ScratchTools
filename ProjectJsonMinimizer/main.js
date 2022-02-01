/*
apologies in advance for desecrating/mutilating/whatever you want to call it @Vadik1's great work. 
I just picked it as my victim^H^H^H^H^H^H base because it had premade code for working with files
and parsing Scratch projects, which is something I *really* didn't want to try and figure out
because I was just too desperate for this thing to become a reality ASAP.
*/
String.prototype.occurrences = function(string, display) {
	var r = this.indexOf(string);
	var c = 0;
	while(r != -1) {
		if(display) throw new Error(string+" found at "+r+"\n"+this.substr(r-100,200));
		c++;
		r = this.indexOf(string, r + 1);
	}
	return c;
}

var JSONFileSizeLimit = 5242880; //just in case they change it again
var AssetSizeLimit = 10000000;
var FilesInProject = []; // array of files in the project
var oversizedFilesInProject = []; // array of files in the project that exceed a size limit. what else?
var oversizedAssetsInProject = []; // great variable names aside, this stores, in human-readable format, a description of the asset that is exceeding the size limit, so it can easily be plopped into the results view.
var projectJson;

var Elements = {
	urlInput: document.getElementById("urlInput"),
	importError: document.getElementById("importError"),
	filePicker: document.getElementById("filePicker"),
	newbar: document.getElementById("new"),
	oldbar: document.getElementById("old"),
	loadFromFile: document.getElementById("loadFromFile"),
	message: document.getElementById("message"),
	results: document.querySelector(".results"),
	loader: document.querySelector(".loader")
	
}

var Loader = {
	loadFromFile: async function () {
			Visual.reset();

			Elements.filePicker.click();
	},
	loadFromFile2: async function(file) {
		let filePromises = [];
		try {
			if(!file) throw new Error("No file was selected");
			Elements.loader.classList = "loader";
			Visual.lock();
			let project;
			let zip = await JSZip.loadAsync(file);
			project = await zip.file("project.json").async("string");
			projectJson = tryFunc(() => JSON.parse(project), "Failed to parse project's JSON");
			// i have no idea what I'm doing; this is probably horrible; sorry in advance
			problemType = 0;
			oversizedAssetsInProject = [];
			FilesInProject = [];
			oversizedFilesInProject = [];
			zip.forEach(function (relativePath, file){
				let currentfile = zip.file(relativePath).async("uint8array") //hnnnnngh why doesn't jszip have an easy way to just get the length of a file inside the archive gsdiojngsdiojfseoptjse9f
				filePromises.push(currentfile)
				currentfile
					.then(function(value){
						FilesInProject.push({name: relativePath, size: value.length}) // "side effects? what's that?"
					})
				
			});
		} catch(error) {
			Elements.importError.innerText = error;
		} finally {
			Visual.unlock();
			return Promise.all(filePromises)
		}
	},

	readBlob: function(file) {
		return new Promise((resolve, reject) => {
			let reader = new FileReader();
			reader.readAsText(file);
			reader.onload = event => resolve(event.target.result);
		});
	},

	processAsset: async function(asset, assets, assetCounter) {
		var md5ext = asset.md5ext;
		if(assets[md5ext]) return Visual.newbar((++assetCounter[0])/assetCounter[1]);
		assets[md5ext] = true;
		assets[md5ext] = await download("https://assets.scratch.mit.edu/internalapi/asset/"+md5ext+"/get","arraybuffer","Failed to download asset "+md5ext);
		console.log("Asset "+md5ext+" loaded");
		Visual.newbar((++assetCounter[0])/assetCounter[1]);
	},

	packageProject: async function(project, assets, zip = new JSZip(), name = "project.sb3") {
		zip.file("project.json", project);

		for(var md5ext in assets) {
			zip.file(md5ext, assets[md5ext]);
		}

		zip.generateAsync({type: "blob", compression: "DEFLATE"})
		.then(function(content) {
			saveAs(content, name);
		});
	}
}


var Visual = {
	reset: function() {
		Elements.importError.innerText = "";
	},

	newbar: function(size) {
		Elements.newbar.style.width = (size*100)+"%";
	},

	oldbar: function(size) {
		Elements.oldbar.style.width = (size*100)+"%";
	},

	show: async function(string){
		Elements.message.innerHTML = string;
		await waitFrame();
	},

	lock: function() {
		Elements.loadFromFile .disabled = true;
	},

	unlock: function() {
		Elements.loadFromFile .disabled = false;
	}
}

Elements.filePicker.onchange = async function(e) { 
	let file = e.target.files[0]; 
	if(!file) return;
	Elements.filePicker.value = null;
	Loader.loadFromFile2(file).then(function() {
		let ProblemType = 0; //0 for no issues, 1 for size warning (90-99% of JSON size limit), 2 for limits exceeded
		let adviceType = []; //great googly moogly the scope in this thing is just a mess. this stores which kind of advice should be given, so that only the advice relevant to the current situation is shown.
		for(const currentFile of FilesInProject){
			if (currentFile.name == "project.json" && currentFile.size > (JSONFileSizeLimit * 0.9) && currentFile.size <= JSONFileSizeLimit){
				oversizedAssetsInProject.push("project.json is close to size limit (" + (currentFile.size / 1048576).toPrecision(3) + "/" + (JSONFileSizeLimit / 1048576).toPrecision(3) + " MiB)");
				adviceType.push("json");
				if(ProblemType != 2) {
					ProblemType = 1;
				}
			}
			if (currentFile.name == "project.json" && currentFile.size > JSONFileSizeLimit){
				oversizedAssetsInProject.push("project.json is too big (" + (currentFile.size / 1048576).toPrecision(3) + "/" + (JSONFileSizeLimit / 1048576).toPrecision(3) + " MiB)");
				adviceType.push("json");
				ProblemType = 2;
			} else if (currentFile.size > AssetSizeLimit){
				oversizedFilesInProject.push(currentFile.name);
				if(adviceType.indexOf(currentFile.name.slice(-3)) == -1){ //check the last 3 letters of the file name, and if it isn't already in adviceType, put it in. 
					adviceType.push(currentFile.name.slice(-3))
				}
				ProblemType = 2;
			}
		}
		let targets = tryVal(projectJson.targets, "Targets not found");
		// now that we have figured out all files in the project that are causing problems, we must iterate through all the assets to map the MD5 filenames to the name of their parent sprite and sound/costume
			for(var spriteName in targets){
				let sprite = targets[spriteName];
				for(var asset in sprite.costumes){
					if(oversizedFilesInProject.indexOf(sprite.costumes[asset].md5ext) != -1){
						if(sprite.name == "Stage"){
							oversizedAssetsInProject.push("Backdrop \"" + sprite.costumes[asset].name + "\" (" + sprite.costumes[asset].md5ext.slice(-3) + ") is too big") //I was going to remark about how this is actually impossible, since 960x720x4bpp = 2,764,800 bytes, but then I remembered SVGs existed. man, who the hell has a 10 MB SVG file?
						} else {
							oversizedAssetsInProject.push("Costume \"" + sprite.costumes[asset].name + "\" (" + sprite.costumes[asset].md5ext.slice(-3) + ") in sprite \"" + sprite.name + "\" is too big")
						}
					}
				}
				for(var asset in sprite.sounds){
					if(oversizedFilesInProject.indexOf(sprite.sounds[asset].md5ext) != -1){
						if(sprite.name == "Stage"){
							oversizedAssetsInProject.push("Sound \"" + sprite.sounds[asset].name + "\" (" + sprite.sounds[asset].md5ext.slice(-3) + ") in Stage is too big")
						} else {
							oversizedAssetsInProject.push("Sound \"" + sprite.sounds[asset].name + "\" (" + sprite.sounds[asset].md5ext.slice(-3) + ") in sprite \"" + sprite.name + "\" is too big")
						}
					}
				}
			}
		//FINALLY we can start dispensing advice.
		let TempElement = null; //stores the element that we are working with right now
		TempElement = document.querySelectorAll(".resultstext") // clean up after the previous advice
		if(TempElement != null){
			for (let advice of TempElement) {
				advice.remove()
			}
		}
		Elements.results.classList = "results";
		Elements.loader.classList = "loader hidden";
		//error, warning and OK icons are my own work. 
		if(ProblemType == 0){
			Elements.results.children[0].classList = "resultsheaderbargreen"
			Elements.results.children[0].children[1].textContent = "No problems found"
			Elements.results.children[0].children[0].setAttribute("src", "okicon.png")
			newElement("p", "resultstext", "Your project does not exceed any of Scratch's project size limits.", Elements.results)
			newElement("p", "resultstext", "If you are experiencing save issues, make sure that you have a solid Internet connection and that you are logged into Scratch. If all else fails, try again later.", Elements.results)
		} else if(ProblemType == 1){
			Elements.results.children[0].classList = "resultsheaderbaryellow"
			Elements.results.children[0].children[1].textContent = "Potential issues found"
			Elements.results.children[0].children[0].setAttribute("src", "warningicon.png")
			newElement("ul", "resultstext", "", Elements.results)
			for(asset of oversizedAssetsInProject){
				newElement("li", "", asset, Elements.results.children[1])
			}
		} else if(ProblemType == 2){
			Elements.results.children[0].classList = "resultsheaderbarred"
			if(oversizedAssetsInProject.length == 1){ //dammit I forgot about this and now I gotta fix it before I get flack for making a tool that told you that it found "1 issues" with an S on the end.
				Elements.results.children[0].children[1].textContent = (oversizedAssetsInProject.length + " issue found")
			}else{
				Elements.results.children[0].children[1].textContent = (oversizedAssetsInProject.length + " issues found")
			}
			Elements.results.children[0].children[0].setAttribute("src", "erroricon.png")
			newElement("ul", "resultstext", "", Elements.results)
			for(asset of oversizedAssetsInProject){
				newElement("li", "", asset, Elements.results.children[1])
			}
		}
		if(adviceType.indexOf("json") != -1){
			newElement("p", "resultstext json", "", Elements.results)
			newElement("b", "", "For project.json: ", document.querySelector(".json"))
			document.querySelector(".json").append("For an immediate fix, try ")
			newLink("https://xeltalliv.github.io/ScratchTools/ProjectJsonMinimizer/", "compressing project.json ", document.querySelector(".json"))
			document.querySelector(".json").append("(this can provide somewhere around a 30% size reduction). To further reduce the size, get rid of anything that is not needed, express any data as compactly as possible, and use as few blocks as you can (in general, fewer blocks means less size).")
		}
		if(adviceType.indexOf("wav") != -1){
			newElement("p", "resultstext wav", "", Elements.results)
			newElement("b", "", "For .wav files: ", document.querySelector(".wav"))
			document.querySelector(".wav").append("The recommended fix for oversized WAV files is to ")
			newLink("https://cloudconvert.com/wav-to-mp3", "convert them to .mp3. ", document.querySelector(".wav"))
			document.querySelector(".wav").append("Even with default settings, this should usually result in a small enough file. If it isn't small enough, try uploading it again, clicking the wrench icon and adjusting the \"Audio Qscale\" option until the file is small enough.")
		}
		if(adviceType.indexOf("mp3") != -1){
			newElement("p", "resultstext mp3", "", Elements.results)
			newElement("b", "", "For .mp3 files: ", document.querySelector(".mp3"))
			document.querySelector(".mp3").append("You may want to try ")
			newLink("https://cloudconvert.com/wav-to-mp3", "re-encoding the .mp3 file ", document.querySelector(".mp3"))
			document.querySelector(".mp3").append("with a lower bit rate. On CloudConvert, you can do this by uploading your .mp3 file, clicking the wrench icon, and adjusting the \"Audio Qscale\" option until the file is small enough. If the loss in audio quality is objectionable, or if the resulting file is still not small enough, you can instead use an audio editor to split the .mp3 file into two or more chunks.")
		}
		if(adviceType.indexOf("svg") != -1){
			newElement("p", "resultstext svg", "", Elements.results)
			newElement("b", "", "For .svg files: ", document.querySelector(".svg"))
			document.querySelector(".svg").append("Wait, where did you find a 10 MB SVG file? Anyways, you should probably just convert it to bitmap in the costume editor and leave it at that (the author of this program certainly doesn't have any better ideas). ")
		}
		console.log("DONE")
	})
}

function newElement(tag, classes, content, appendee){ //goes through the process of creating a new element, setting up its properties, and appending it to something.
	let temporaryElement = document.createElement(tag)
	temporaryElement.classList = classes
	temporaryElement.textContent = content
	appendee.append(temporaryElement)
}
function newLink(href, content, appendee){
	let temporaryElement = document.createElement("a")
	temporaryElement.setAttribute("href", href)
	temporaryElement.textContent = content
	appendee.append(temporaryElement)
}
function tryFunc(func, error) {
	try {
		return func();
	} catch(e) {
		throw new Error(error);
	}
}

function tryVal(val, error) {
	if(val){
		return val;
	} else {
		throw new Error(error);
	}
}

function waitFrame(){
	return new Promise((resolve,reject) => {
		window.requestAnimationFrame(() => resolve(true));
	});
}

var requestsAwaiting = [];
var requestsActive = 0;
