
/**
 * Module for the management of documents, RTF DOCUMENTS and generation of PDFs from
 * Data (Json) or PDF to text 
 * OpenOffice, Tesseract and Gostscript are required for conversion
 * @module rtf2pdf
 * @version 0.0.1
 * @license MIT 
 * @author jankstar
 * 
 */
const rtf2pdf = (() => {

    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const fs = require('fs').promises;
    const path = require('path');
    const promise_exec = require("child_process").exec;
    const { v4: uuidv4 } = require('uuid');

    /**
    * @property {Array} DOC_BUFFER Array of documents in memory
    * @property {String} DIRECTORY the directory used for files 
    * @property {Number} BUFFER the buffer for the EXEC 
    * @property {String} LANGU the language in ISO natation
    * @property {Array} STATUS Array of strings as Status
    */
    var DOC_BUFFER = [],        //Documents in local memory
        DIRECTORY = 'temp/',   //Directory for temp data
        BUFFER = (1024 * 500),
        LANGU = 'en-UK',       //Language for converting
        STATUS = ['01_new']    //Document status info

    /**
    * Executes cmd as a shell command in a promis and returns stdout
    * @param {String} cmd Shell Command started as Promise 
    * @returns {Promise} Promise returns stdout or error 
    * @property {Number} BUFFER the buffer for the EXEC 
    */
    function exec(cmd) {
        return new Promise((resolve, reject) => {
            try {
                console.log(cmd);
                promise_exec(cmd, { maxBuffer: BUFFER }, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    } else if (stdout) {
                        resolve(stdout);
                    } else {
                        resolve(stderr);
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
    * Returns the language from ISO in tesseract notation
    * @param {String} iLangu Language in ISO e.g. 'de-DE'.
    * @returns {String} Language for tesseract e.g. 'deu'.
    */
    function _convertLangu(iLangu) {
        if (iLangu.substring(0, 2) == 'de') return 'deu';
        if (iLangu.substring(0, 2) == 'en') return 'eng';
    }

    /**
    * Decoding Umlaute utf-8 in ascii/latin1
    * @param { String } str data string input
    * @returns  { String } Converted data string
    */
    function _rtfDecoding(str) {

        str = str.replace(/\xa0/gm, ' '); //no-break Space wird Space 
        str = str.replace(/[^\x00-\x7f]/gm, function (match) {
            if (match == "???") return "\\'80"; //Euro ist reines Unicode, das geht nicht
            return "\\'" + ((match.charCodeAt(0).toString(16))).slice(-4)
        })

        return str;

    }

    /**
     * Saves a base64 as a file;
     * generates a file name from uuid in temp directory if necessary 
     * @async
     * @param {String} iBase64 data from the binary file
     * @param {String} iFilename  Name of the file, if not given, then generated in temp
     * @returns {*} { filename, error } of the file
     */
    async function _base64ToFile(iBase64, iFilename) {
        try {
            if (!iBase64) { throw Error(`Base64 data must be provided.`) }
            let lFieldName = iFilename || DIRECTORY + uuidv4() + '.pdf'
            const buffDocument = Buffer.from(iBase64, 'base64');
            await fs.writeFile(lFieldName, buffDocument, 'binary');
            return { filename: lFieldName, error: undefined }
        } catch (err) {
            console.log(err)
            return { filename: undefined, error: err }
        }
    }

    /**
     * Creates a base64 string from a file
     * @async
     * @param {String} iFilename name of a file (binary)
     * @returns {String} base64 data from the file
     */
    async function _fileToBase64(iFilename) {
        let lData = undefined
        try {
            if (!iFilename) { throw Error(`No filename specified.`) }
            lData = await fs.readFile(iFilename, 'binary')
            const lBuff = Buffer.from(lData,'binary')
            return lBuff.toString('base64');
        } catch (err) {
            console.log(err)
        }
        return undefined;
    }

    /**
     * Replaces variables from an RTF string
     * @param {String} iLangu Sprache, z.B. 'de-DE'
     * @param {Object} iVar  Variablen als json
     * @param {String} iData  rtf-Daten file
     * @param {Array}  iElements  Array der Elemente (Tabelle/Felder)
     * @param {Number}  iCount Index bei Array als Sub-Aufruf eines Array 
     * @returns {String} R??ckgabewert als rtf-Daten file
     */
    function _replaceVarInRTF(iLangu, iVar, iData, iElements, iCount, iProtocol) {
        let rData = '';
        try {
            iLangu = iLangu || LANGU || 'de-DE';
            iVar = iVar || {};
            iElements = iElements || [];
            iProtocol = iProtocol || [];

            if (typeof iVar != 'object') {
                iVar = {}
                iProtocol.push("Error - iVar is not a object.")
            }

            let lBefore = undefined;

            iElements.forEach((element) => {
                if (!lBefore) {
                    //der erste Eintrag
                    rData = iData.substring(0, element.start)
                } else {
                    //wir starten bei dem Ende des vorherigen Feld
                    rData += iData.substring(lBefore.end, element.start)
                }

                if (element.type == "field") {
                    //jetzt das Feld ersetzen, wenn m??glich
                    //zuerst m??gloche json Parameter quoten 
                    let lElementName = element.name.replace(/\"[]*: /gm, '"=').replace(/\'[]*: /gm, "'=");
                    //jetzt die Patameter trennen - 0 ist Name, alle anderen sind Parameter
                    let lFieldName = lElementName.split(/:/);
                    if (lFieldName && lFieldName[0]) {
                        let lFieldNameLevel = lFieldName[0].split('.');
                        let lReplace = iVar
                        lFieldNameLevel.forEach((varLevel) => {
                            if (typeof iCount == 'number' && lReplace[iCount] && lReplace[iCount][varLevel]) {
                                //das ist ein array und ein Feld
                                lReplace = lReplace[iCount][varLevel];
                            } else if (lReplace[varLevel]) {
                                //das ist nur ein Feld
                                lReplace = lReplace[varLevel];
                            }
                        })
                        if (typeof lReplace == 'string' || typeof lReplace == 'number' || lReplace instanceof Date) {
                            if (typeof lReplace == 'string' && /\d{4}-\d{2}-\d{2}T\d{2}\:\d{2}\:\d{2}[0-9\.\+Z]*/.test(lReplace)) {
                                //Datum kann auch als String formatiert sein wg. json, dann in Date object umwandeln
                                lReplace = new Date(lReplace);
                            }
                            if (typeof lReplace == 'string') {
                                lReplace = _rtfDecoding(lReplace.toString('utf8'));
                            }
                            if (typeof lReplace == 'number' || lReplace instanceof Date) {
                                if (!lFieldName[1]) {
                                    //sytle
                                    lReplace = _rtfDecoding(lReplace.toLocaleString(iLangu));
                                } else {
                                    try {
                                        //jetzt den 1ten Parameter wieder zur??ck zum Json konvertieren
                                        let option = JSON.parse('{ ' + lFieldName[1].replace(/=/gm, ':').replace(/'/gm, '"') + ' }');
                                        lReplace = _rtfDecoding(lReplace.toLocaleString(iLangu, option));
                                    } catch (err) {
                                        console.log(err.message);
                                        lReplace = _rtfDecoding(lReplace.toLocaleString(iLangu));
                                    }
                                }
                            }
                            rData += `${lReplace}`;
                            iProtocol.push(`Replace "${iData.substring(element.start, element.end)}" with "${lReplace}"`)
                        } else {
                            console.log(`Variable for field ${lFieldName} not found.`)
                            iProtocol.push(`Variable for field ${lFieldName} not found.`)
                        }
                    }
                } else if (element.type == "array") {
                    //Determine the number of entries in the first array
                    let lCountArray = 0;
                    let lReplace = iVar
                    element.fields.forEach((field) => {
                        if (lCountArray > 0) { return } //only the first array!
                        let lFieldName = field.name.split(/:/);
                        if (lFieldName && lFieldName[0]) {
                            let lFieldNameLevel = lFieldName[0].split('.');

                            lFieldNameLevel.forEach((varLevel) => {
                                if (lReplace[0]) {
                                    //this field is a (first) array 
                                    return
                                } else if (lReplace[varLevel]) {
                                    //that is only one field
                                    lReplace = lReplace[varLevel];
                                }
                            })
                        }

                        if (lReplace[0]) {
                            lCountArray = lReplace.length;
                        }
                    })
                    for (i = 0; i < lCountArray; i++) {
                        rData += _replaceVarInRTF(iLangu, iVar, element.name, element.fields, i, iProtocol)
                    }
                } else {
                    //Error
                }
                lBefore = element;

            })

            if (!lBefore) {
                //there were no fields ...
                rData = iData
            } else {
                //append the rest to the last field
                rData += iData.substring(lBefore.end, iData.length)
            }
        } catch (err) {
            console.log(err);
            iProtocol.push(`Error: ${err.message}`)
        }
        return rData
    }

    /**
     * Creates an elements array from an RTF string for RTF tags and variables.
     * @param {String} iData rtf-Data file as string
     * @returns {Array} Elements als Array
     */
    function _createElementsFromRTF(iData) {

        let lMyMap = [];
        let lRexEx2 = /:#field:|:#array:|:#include:|#:|\\row }|\\row \\/gm;

        lMyMap = Array.from(iData.matchAll(lRexEx2), (m) => {
            return { tag: m[0], index: m["index"] };
        });

        let elements = []
        let field = { type: "field", start: 0, end: 0, start_tag: undefined, end_tag: undefined, name: '' };
        let table = { type: "array", start: 0, end: 0, start_tag: undefined, end_tag: undefined, name: '', fields: [], trowd: undefined }
        lMyMap.forEach((element) => {

            if (element.tag.substring(0, 2) == ':#') {
                if (field.start > 0) {
                    console.log(`Start-Element ${element.tag} ohne Ende-Tag.`)
                }
                field = { type: "field", start: 0, end: 0, start_tag: undefined, end_tag: undefined, name: '' };
                field.start = element.index;
                field.start_tag = element;
            }

            if (element.tag == '#:') {
                if (field.start && field.start >= 0) {
                    field.end = element.index + element.tag.length;
                    field.end_tag = element;
                    field.name = iData.substring(field.start + field.start_tag.tag.length, field.end - field.end_tag.tag.length)

                    field.name = field.name.replace(/\\[a-zA-Z0-9]|{|}/gm, ""); //no rtf control indicators in variables
                    field.name = field.name.replace(/[^\x20-\xff]/gm, ""); //no control characters like nl

                    if (table.start && table.start >= 0) {
                        //it is a field in a table
                        field.start -= table.start;
                        field.end -= table.start;
                        table.fields.push(field)
                    } else {
                        //it is a field without a table
                        elements.push(field)
                    }
                }
                field = { type: "field", start: 0, end: 0, start_tag: undefined, end_tag: undefined, name: '' };

            }

            if (element.tag == '\\row \\') {
                //Ende einer inneren Zeile der Tabelle
                table = { type: "array", start: 0, end: 0, start_tag: undefined, end_tag: undefined, name: '', fields: [], trowd: undefined }
                table.start = element.index;
                table.start_tag = element;
            }


            if (element.tag == '\\row }') {
                //last row of a table - tag,
                if (table.start && table.start >= 0
                    //only if there are also fields in the table!
                    && table.fields.length > 0) {

                    table.end = element.index;
                    table.end_tag = element;
                    table.name = iData.substring(table.start, table.end);
                    //console.log(`${iData.substring(table.start, table.start + 10)} ** ${iData.substring(table.end - 10, table.end)}`)
                    elements.push(table)
                }
                table = { type: "array", start: 0, end: 0, start_tag: undefined, end_tag: undefined, name: '', fields: [], trowd: undefined }
            }

        });

        return elements;
    }

    /**
     * Class representing a document
     * @example
     * let lDoc = new Document({subject: 'test', filename:'test.pdf', type: 'PDF'})
     * 
     */
    class Document {

        /**
         * Create a document
         * @param {*} value is a structure of the fields of a document
         * id
         * date
         * subject
         * status
         * task
         * in_use
         * filename
         * file_extension
         * type
         * root_of
         * template
         * data
         * info
         * metadata
         * cathegory
         * langu
         * num_page
         * body
         * base64
         * protocol
         */
        constructor(value) {
            var now = new Date();
            value = value || {}
            this.id = value.id || uuidv4()
            this.date = value.date || now.toISOString()
            this.subject = value.subject || ""
            this.status = value.status || STATUS[0]
            this.task = value.task || "create"
            this.in_use = value.in_use || "completed"
            this.filename = value.filename || ""
            this.file_extension = path.extname(this.filename.toLowerCase()) || ""
            this.type = value.type || ""
            if (!this.type) {
                this.type = this.file_extension.replaceAll(/\./g,'') //clear all points
            }
            this.type = this.type.toUpperCase()
            this.root_of = value.root_of || ""
            this.template = value.template || ""
            this.data = value.data || {}
            this.info = value.info || {}
            this.metadata = value.metadata || {}
            this.category = value.category || []
            this.inputpath = value.inputpath || ""
            this.langu = value.langu || "de-DE"
            this.num_pages = value.num_pages || 0
            this.body = value.body || ""
            this.base64 = value.base64 || ""
            //
            this.protocol = []
            this.is_file = false || (this.filename != '');
        }

        setValue(value) {
            value = value || {}
            this.id = value.id || this.id
            this.date = value.date || this.date
            this.subject = value.subject || this.subject
            this.status = value.status || this.status
            this.task = value.task || this.task
            this.in_use = value.in_use || this.in_use
            this.filename = value.filename || this.filename
            this.type = value.type || this.type
            this.type = this.type.toUpperCase()
            this.root_of = value.root_of || this.root_of
            this.template = value.template || this.template
            this.data = value.data || this.data
            this.info = value.info || this.info
            this.metadata = value.metadata || this.metadata
            this.category = value.category || this.category
            this.inputpath = value.inputpath || this.inputpath
            this.langu = value.langu || this.langu
            this.num_pages = value.num_pages || this.num_pages
            this.body = value.body || this.body
            this.base64 = value.base64 || this.base64
            this.is_file = false || (this.filename != '');
        }

        /**
         * Checks in the document, i.e., the file in filename becomes a base64 and the file is deleted
         * @async
         * @param {Boolean} iNotDel if set, the file is not deleted
         */
        async checkIn(iNotDel) {
            try {
                if (!this.type) { throw Error(`Type of document not defined.`) }
                if (!this.base64) {
                    if (!this.filename) { throw Error(`CheckIn requires either base64 or a file (filename).`) }
                    this.base64 = await _fileToBase64(this.filename)
                }
                if (!iNotDel && this.filename) {
                    fs.rm(this.filename)
                }
            } catch (err) {
                console.log(err)
                this.protocol.push(`Error: ${err.message}`)
            }
        }

        /**
        * Checks out the document, i.e. a file is created from the base64 in filename
        * @async
        */
        async checkOut() {
            let { filename: lFilename, error: err } = await _base64ToFile(this.base64, this.filename)
            if (err) {
                console.log(err)
                this.protocol.push(`Error: ${err.message}`)
            } else {
                this.filename = lFilename
            }
        }

        /**
         * @param {Boolean} iReWrite true -> rewrite the template 
         * @returns true/false 
         */
        isTemplate(iReWrite) {
            try {
                if (!this.template) throw Error("No template name found.")
                if (this.type != 'RTF') throw Error(`Wrong type ${this.type}`)
                if (!this.subject) throw Error("Subject is missing.")
                let newTemplate = rtf2pdf.findDocBySubject(this.subject, this.type, this.template)
                if (newTemplate) {
                    if (!iReWrite) throw Error(`There is already a template with this name ${this.template}.`)
                    newTemplate = this;
                } else {
                    DOC_BUFFER.push(this)
                    this.protocol.push("Document saved as template.")
                }
                return true;
            } catch (err) {
                console.log(err)
                this.protocol.push(`Error: ${err.message}`)
                return false;
            }
        }

        /**
         * Converts a PDF (file or base64) to text Body, start OCR if necessary.
         * @async
         * @property {String} filename
         * @property {String} base64
         * @return {String} Body
         */
        async convertPDFToTextBody() {
            let me = this
            try {
                if (this.type != 'PDF') { throw Error(`Wrong document type ${me.type} - PDF expects.`) }
                if (!this.filename) {
                    //a file is required -> base64 to file
                    if (this.base64) {
                        let { filename: lFilename, error: err } = await _base64ToFile(this.base64)
                        if (err) { throw Error(err) }
                        if (lFilename) {
                            this.filename = lFilename
                        } else {
                            throw Error(`No file created.`)
                        }
                    } else {
                        throw Error("If no file, then base64 is required.")
                    }
                }

                const loadingTask = pdfjsLib.getDocument(this.filename);
                await loadingTask.promise
                    .then(async (doc) => {
                        //Process Document
                        me.num_pages = doc.numPages;
                        me.protocol.push(`# Document Loaded '${me.filename}'`);
                        me.protocol.push(`# Number of Pages: '${me.num_pages}'`);

                        let lastPromise; // will be used to chain promises
                        lastPromise = doc.getMetadata().then((data) => {
                            me.protocol.push("# Metadata Loaded");
                            me.info = data.info;
                            me.metadata = data.metadata;
                        }, (err) => {
                            //when reject
                            me.protocol.push(err.message)
                            console.log(err.message)
                        });

                        //loadPage is a function for processing a page
                        const loadPage = function (pageNum) {
                            //Process page
                            return doc
                                .getPage(pageNum)
                                .then((page) => {
                                    me.protocol.push(`# Page ${pageNum}`);
                                    const viewport = page.getViewport({ scale: 1.0 });
                                    me.protocol.push(`# Size: ${viewport.width}  x ${viewport.height}`);

                                    return page
                                        .getTextContent()
                                        .then((content) => {
                                            // Content contains lots of information about the text layout and
                                            // styles, but we need only strings at the moment
                                            const strings = content.items.map((item) => {
                                                return item.str;
                                            });

                                            me.protocol.push(`## Text Content`);
                                            me.body = me.body + strings;
                                            if (me.body) {
                                                me.body = me.body + "\n";
                                                me.task = 'OCR';
                                            }
                                        }, (err) => {
                                            //when reject
                                            me.protocol.push(err.message)
                                            console.log(err.message)
                                        })
                                }, (err) => {
                                    //when reject
                                    me.protocol.push(err.message)
                                    console.log(err.message)
                                });
                        };
                        // Loading of the first page will wait on metadata and subsequent loadings
                        // will wait on the previous pages.
                        for (let i = 1; i <= doc.numPages; i++) {
                            lastPromise = lastPromise.then(loadPage.bind(null, i));
                        }
                        return lastPromise;
                    })
                    .then(async () => {
                        me.protocol.push(`# End of Document`);
                        if (!me.body || me.body == "") {
                            me.protocol.push(`# Start GS for jpeg extracting`);
                            await fs.mkdir(DIRECTORY + me.id);

                            me.task = 'converting'
                            const gs_data = await exec(`gs -dSAFER -dBATCH -dNOPAUSE -r1200 -sDEVICE=jpeg -sOutputFile=${DIRECTORY + me.id}/page%03d.jpg ` + me.filename)

                            me.protocol.push(gs_data);
                            var files = await fs.readdir(DIRECTORY + me.id)
                            files = files.sort()
                            for (let file of files) {
                                if (path.extname(file) == '.jpg') {
                                    me.protocol.push(`# Read and OCR convert file ${file} by tesseract`);

                                    me.task = 'OCR'
                                    const tes_data = await exec(`tesseract ${DIRECTORY + me.id}/${file} ${DIRECTORY + me.id}/${file} -l ${_convertLangu(me.langu)} ${__dirname}/gosseract.ini`)
                                    if (tes_data) {
                                        me.protocol.push(`Tesseract: ${tes_data}`);
                                    } else {
                                        me.protocol.push(`Tesseract ends without a message.`);
                                    }

                                    const file_data = await fs.readFile(DIRECTORY + me.id + "/" + file + ".txt", 'utf8')
                                    me.body = me.body + file_data;

                                    //now the files jpg/txt can be deleted
                                    await fs.rm(DIRECTORY + me.id + "/" + file + ".txt");
                                    await fs.rm(DIRECTORY + me.id + "/" + file);
                                }
                            }

                            //now the directory can be deleted
                            await fs.rmdir(DIRECTORY + me.id);

                        }
                        me.protocol.push(`# Conversion of the docuemnt ${me.id} successfully completed.`);
                    }, (err) => {
                        //when reject                              
                        me.protocol.push(`Error from GS exec: ${err.message}`);
                        console.log(err.message)
                    }
                    );

            } catch (err) {
                me.protocol.push(`Error: ${err.message}`);
                console.log(err.message)
            }
            return this.body
        }


    }


    return {

        Document,

        /**
         * Sets the module variables DIRECTORY, BUFFER, LANGU, STATUS[]
         * @param {Object} iValue as {DIRECTORY,BUFFER,LANGU,STATUS}
         */
        setConfig(iValue) {
            let lValue = iValue || {}
            DIRECTORY = lValue.DIRECTORY || DIRECTORY;
            BUFFER = lValue.BUFFER || BUFFER
            LANGU = lValue.LANGU || LANGU
            STATUS = lValue.STATUS || STATUS
        },

        /**
         * Saves a base64 as a file;
         * generates a file name from uuid in temp directory if necessary 
         * @async
         * @param {String} iBase64 data from the binary file
         * @param {String} iFilename  Name of the file, if not given, then generated in temp
         * @returns {*} { filename, error } of the file
         */
        base64ToFile: _base64ToFile,

        /**
         * Creates a base64 string from a file
         * @async
         * @param {String} iFilename name of a file (binary)
         * @returns {String} base64 data from the file
         */
        fileToBase64: _fileToBase64,

        /**
        * Decoding Umlaute utf-8 in ascii/latin1
        * @param { String } str data string input
        * @returns  { String } Converted data string
        */
        rtfDecoding: _rtfDecoding,

        /**
         * Checks and installs ghostscript, tesseract und libreOffice
         * @async
         * @param {Boolean} iInstall true - it is installed if not found
         * @param {String} iLangu the language for tesseract
         * @returns {Object} { data: {gs, tesserct, soffice}, error:[String]}
         */
        async checkInstallation(iInstall, iLangu) {
            iLangu = iLangu || 'de-DE';
            let lLanguOffice = iLangu.substring(0, 2)

            const lInst = [
                {
                    "wich": "which gs",
                    "check": "gs",
                    "install": "apt-get -y update; apt-get -y install ghostscript",
                    "error": "Error from installation ghostscript:",
                    "return": "gs",
                    "success": "The gs programme is installed"
                }, {
                    "wich": "which tesseract",
                    "check": "tesseract",
                    "install": 'apt-get -y update; apt-get -y install tesseract-ocr; apt-get -y install tesseract-ocr-' + _convertLangu(iLangu),
                    "error": "Error from installation tesseract-ocr:",
                    "return": "tesseract",
                    "success": "The tesseract programme is installed"
                }, {
                    "wich": "which soffice",
                    "check": "soffice",
                    "install": 'apt-get -y update; apt-get -y install libreoffice libreoffice-l10n-' + lLanguOffice + ' libreoffice-help-' + lLanguOffice,
                    "error": "Error from installation libreoffice:",
                    "return": "soffice",
                    "success": "The soffice programme is installed"
                }
            ]
            var lData = {
                "gs": false,
                "tesseract": false,
                "soffice": false
            }
            var lCheckThis = ''
            var lInstallMe = ''
            var ltError = []
            try {

                for (let i = 0; i < lInst.length; i++) {
                    lCheckThis = await exec(lInst[i].wich);
                    if (!lCheckThis.includes(lInst[i].check)) {
                        if (iInstall) {
                            //Programm nicht gefunden -> installieren
                            lInstallMe = await exec(lInst[i].install)
                            lCheckThis = await exec(lInst[i].wich);
                            if (!lCheckThis.includes(lInst[i].check)) {
                                ltError.push(`${lInst[i].error}: ${lInst[i].install}: ${lInstallMe}`);
                                lData[lInst[i].return] = false;
                            } else {
                                lData[lInst[i].return] = true;
                            }
                        } else {
                            ltError.push(`${lInst[i].error}`);
                            lData[lInst[i].return] = false;
                        }
                    } else {
                        lData[lInst[i].return] = true;
                    }
                    if (lData[lInst[i].return] == true) {
                        console.log(lInst[i].success)
                    } else {
                        console.log(lInst[i].error)
                    }
                }

                return { data: lData, error: ltError };

            } catch (err) {
                ltError.push(err.message);
                return { data: lData, error: ltError };
            }
        },


        /**
         * Returns a document for a name and a type (optional)
         * @param {String} iSubject 
         * @param {String} iType optional
         * @param {String} iTemplate optional
         * @returns {Document}
         */
        findDocBySubject(iSubject, iType, iTemplate) {
            for (let index = 0; index < DOC_BUFFER.length; index++) {
                if (iType && iTemplate) {
                    if (DOC_BUFFER[index].subject == iSubject
                        && DOC_BUFFER[index].type == iType
                        && DOC_BUFFER[index].template == iTemplate) {
                        return new Document(DOC_BUFFER[index]);
                    }
                } else {
                    if (iType) {
                        if (DOC_BUFFER[index].subject == iSubject && DOC_BUFFER[index].type == iType) {
                            return new Document(DOC_BUFFER[index]);
                        }
                    } else {
                        if (iTemplate) {
                            if (DOC_BUFFER[index].subject == iSubject
                                && DOC_BUFFER[index].template == iTemplate) {
                                return new Document(DOC_BUFFER[index]);
                            }
                        } else {
                            if (DOC_BUFFER[index].subject == iSubject) {
                                return new Document(DOC_BUFFER[index]);
                            }
                        }
                    }
                }
            }
            return undefined
        },

        /**
         * Supplies the data for a template by name (template) as string
         * @param {String} iName Template name
         * @returns {*}  { doc: Document, error: Error }
         */
        async getTemplate(iName) {
            let lDoc = undefined;
            try {
                lDoc = rtf2pdf.findDocBySubject(iName, 'RTF', iName)
                if (!lDoc) { throw Error(`Template ${iName} not found.`) }
                if (!lDoc.body) {
                    if (!lDoc.filename) { throw Error(`Template ${iName} cannot be loaded.`) }
                    lDoc.body = await fs.readFile(lDoc.filename, 'utf-8');
                }
                return { doc: lDoc, error: undefined };
            } catch (err) {
                return { doc: undefined, error: err }
            }
        },



        /**
        * Defines a template and writes it to the buffer array
        * @param {String} iName 
        * @param {String} iFileName 
        * @returns {Document} Template
        */
        newTemplateByFile(iName, iFileName) {
            try {
                let lDoc = new Document({ subject: iName, template: iName, filename: iFileName, task: 'RTF_from_File' });
                lDoc.protocol.push(`Start 'newTemplateByFile' with name ${iName}`)
                if (!lDoc.subject) { throw Error(`The name of the template or the subject must be specified.`) }
                if (!iFileName) { throw Error(`A file name must be specified.`) }
                if (path.extname(iFileName.toLowerCase()) != '.rtf') { throw Error(`The filename must be RTF for a template.`) }
                lDoc.type = 'RTF'

                let newTemplate = rtf2pdf.findDocBySubject(lDoc.subject, lDoc.type, lDoc.template)
                if (newTemplate) {
                    throw Error(`There is already a template with this name ${iName}.`)
                } else {
                    DOC_BUFFER.push(lDoc)
                }
                return lDoc;
            } catch (err) {
                this.protocol.push(`Error: ${err.message}`);
                return undefined;
            }
        },


        /**
         * Generates a document (correspondence) for a template with specified data.
         * @async
         * @param {*} iLangu Language used for the document in ISO 
         * @param {*} iTemplate Template used 
         * @param {*} iVar Variables for replacement in the template json structure
         * @returns {Document} returns a document with the RFT in the body
         */
        async createDocAsCorrespondence(iLangu, iTemplate, iVar) {
            let lDoc = new Document({ subject: `Correspondence of template ${iTemplate}`, template: iTemplate, task: 'Create_Correspondence' });
            lDoc.protocol.push(`Start 'createDocAsCorrespondence' with template ${iTemplate}`)
            try {
                let { doc: lTemplate, error: err } = await this.getTemplate(iTemplate);
                if (err || !lTemplate || !lTemplate.body) {
                    err = err || {}
                    err.message = err.message || 'template not found'
                    console.log(err)
                    lDoc.protocol.push(`Error: ${err.message}`)
                    return lDoc;
                }

                let elements = _createElementsFromRTF(lTemplate.body);

                //console.log(elements);
                //Replace fields
                lDoc.body = _replaceVarInRTF(iLangu, iVar, lTemplate.body, elements, undefined, lDoc.protocol);
                lDoc.protocol.push(`Correspondence created.`)
                lDoc.type = 'RTF';
                return lDoc;

            } catch (err) {
                err.message = err.message || err;
                console.log(err.message)
                lDoc.protocol.push(`Error: ${err.message}`)
                return lDoc;
            }
        },

        /**
         * Converts RTF to PDF and delivers row data (string as binary)
         * @async
         * @param {String} iData as RTF
         * @returns {Object} { data , rtf_filename , pdf_filename ,error } data is PDF as string in raw data (binary)
         */
        async convertRtfToPDFByData(iData, iNotDel) {
            try {
                let lFileName = uuidv4();
                await fs.writeFile(`${DIRECTORY}${lFileName}.rtf`, iData, 'utf8');
                let lMessage = await exec(`soffice --headless --norestore --convert-to pdf ${DIRECTORY}${lFileName}.rtf --outdir ${DIRECTORY}`);
                let lData = await fs.readFile(`${DIRECTORY}${lFileName}.pdf`, 'binary');
                if (!iNotDel) {
                    fs.rm(`${DIRECTORY}${lFileName}.rtf`);
                    fs.rm(`${DIRECTORY}${lFileName}.pdf`);
                    return { data: lData, rtf_filename: '', pdf_filename: '', error: undefined }
                }
                return { data: lData, rtf_filename: `${DIRECTORY}${lFileName}.rtf`, pdf_filename: `${DIRECTORY}${lFileName}.pdf`, error: undefined }
            } catch (err) {
                return { data: undefined, rtf_filename: '', pdf_filename: '', error: err }
            }
        },

        /**
         * Generates a PDF file from an RTF file
         * @async
         * @param {Document} iDoc RDF document
         * @param {Boolean} iNotDel if 'true', the temporary files for the RTF and PDF document are not deleted but returned
         * @returns {Document} a new document as PDF
         */
        async convertRtfToPDF(iDoc, iNotDel) {
            let lNewDoc = new Document({ subject: iDoc.subject, template: iDoc.template, task: 'RTF_to_PDF'});
            lNewDoc.protocol = lNewDoc.protocol.concat(iDoc.protocol)
            lNewDoc.protocol.push(`Start 'convertRtfToPDF' with subject '${iDoc.subject}'`)
            try {
                if (!iDoc.body) { throw Error(`Document has an RTF body.`) }
                if (iDoc.type != 'RTF') { throw Error(`Document is not of type RTF`) }
                let { data: lData, rtf_filename: lRTFFilename, pdf_filename: lPDFFilename, error: err } = await rtf2pdf.convertRtfToPDFByData(iDoc.body, iNotDel)
                if (err) { throw err }
                iDoc.filename = lRTFFilename

                const lBuff = Buffer.from(lData,'binary')
                lNewDoc.base64 = lBuff.toString('base64');
                lNewDoc.filename = lPDFFilename;
                lNewDoc.type = 'PDF';
                lNewDoc.checkIn(iNotDel);

            } catch (err) {
                console.log(err)
                lNewDoc.protocol.push(`Error: ${err.message}`)
            }
            return lNewDoc;
        },


        /**
        * Test routine generates a PDF from test/Brief1.rtf
         * and test data a PDF
         * and a text body from a test PDF file.
         * @async
         */
        async test() {
            //Checking the installation of gs, tesseract and openoffice
            let lInstData = await rtf2pdf.checkInstallation(true, "de-DE")
            console.log(`\nStart 'checkInstallation'`)
            for (element in lInstData.data) {
                console.log(`** ${element}: ${lInstData.data[element]}`)
            }

            //Regsitrate new RTF template 
            let lDoc1 = rtf2pdf.newTemplateByFile('test', `${__dirname}/test/Brief1.rtf`);
            if (lDoc1 && lDoc1.filename) {
                console.log(`\nRTF Template file ${lDoc1.filename} found.`)
            } else {
                if (lDoc1) {
                    console.log(lDoc1.protocol)
                } else {
                    console.log(`RTF Template document not found.`)
                }
                return;
            }

            //Create a correspondence as a new document for an RTF template 
            let lDoc2 = await rtf2pdf.createDocAsCorrespondence('de-DE', 'test',
                {
                    "name": {
                        "vorname": "Hans-Joachim",
                        "nachname": "L??denscheid",
                        "strasse": "An der gro??en Br??cke",
                        "hnr": "192a",
                        "telnr": "+49 151 99886677",
                        "email": "hjo.luedie@mac.com"
                    },
                    "to": {
                        "titel": "Herr",
                        "name1": "Hans M??ller",
                        "strasse": "Unter den Eichen",
                        "hnr": "142",
                        "plz": "14163",
                        "ort": "Berlin",
                        "anrede": "Sehr geehrter Herr M??ller"
                    },
                    "leistung": [
                        { "nr": 100, "bezeichnung": "Haseln??sse", "preis": 4.50 },
                        { "nr": 101, "bezeichnung": "Sonderzeichen ?????????????????", "preis": 6.75 }
                    ],
                    "auftrag": {
                        "datum": new Date()
                    }
                }
            )

            //Generate a PDF document from RTF document
            if (lDoc2 && lDoc2.body) {
                console.log(`\nRTF document subject ${lDoc2.subject} created.\n`)
                lDoc2.protocol.forEach((text) => {
                    console.log('** ' + text)
                })
                let lDoc3 = await rtf2pdf.convertRtfToPDF(lDoc2, true)
                if (lDoc3 && lDoc3.filename) {
                    console.log(`\nPDF document ${lDoc3.filename} created.\n`)

                    lDoc2.checkIn() //<-- delete temp file 
                    lDoc3.checkIn() //<-- delete temp file
                } else {
                    if (lDoc3) {
                        console.log(lDoc3.protocol)
                    } else {
                        console.log(`PDF document not created.`)
                    }
                }

            } else {
                if (lDoc2) {
                    console.log(lDoc2.protocol)
                } else {
                    console.log(`RTF document not created.`)
                }
            }

            //Convert a text from a PDF - for this test the file Rechnung1.PDF must be under ./test
            let lDoc4 = new Document({ subject: "test PDF to Text", type: "PDF", filename: `${__dirname}/test/Rechnung1.PDF`, langu: 'de-DE' })
            //convert the PDF to text using tesseract 
            await lDoc4.convertPDFToTextBody();
            console.log(`PDF document ${lDoc4.filename} converts to text`)
            lDoc4.protocol.forEach((text) => {
                console.log(text)
            })

        }
    }
})();

module.exports = {
    rtf2pdf
}