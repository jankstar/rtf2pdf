# rtf2pdf Module
This module provides the following functions:

## 1. Documents
Management of documents in a class, with the following attributes:
```
{id, date, subject, status, task, in_use, filename, file_extension, type, template, data, info, metadata, cathegory[String], langu, num_page, body, base64, protocol[String] }
```
langu - the ISO notation of the language, e.g. 'de-DE' or 'en-UK'.

### 1.1 new Dokument()
Define a new document as a PDF; the filename references a file:
```
    //Create a PDF document
    let lDoc4 = new Document({ subject: "test PDF to Text", type: "PDF", filename: "test/Rechnung1.PDF", langu: 'de-DE' })
```

### 1.2 checkIn() / checkOut()
The file is converted to base64 - the parameter controls whether the file is not deleted.
"checkIn()" deletes the local file if necessary and creates a base64 element in the documnet. Now the document can be transferred e.g. via service or saved as Json.
```
    lDoc4.checkIn(true);
```
The "checkOut()" again creates a local file from the base64.

local file --> "checkIn()" --> base64 --> "checkOut()" --> local file 


### 1.3 newTemplateByFile
A template is an RTF document and can be created from an RTF file.
The template is stored in an internal memory.
```
    //Regsitrate new RTF template by file
    let lDoc1 = rtf2pdf.newTemplateByFile('test', 'test/Brief1.rtf');
    if (lDoc1 && lDoc1.filename) {
        console.log(`\nRTF Template file ${lDoc1.filename} found.`)
    } else {
        if (lDoc1) {
            console.log(lDoc1.protocol)
        } else {
            console.log(`RTF Template document not found.`)
        }
    }
```

### 1.4 createDocAsCorrespondence
Correspondences can then be created with the template. For this purpose, the data that is to be replaced in the variables of the template is provided.
```
    //Create a correspondence as a new document for an RTF template 
    let lDoc2 = await rtf2pdf.createDocAsCorrespondence('de-DE', 'test',
        {
            "name": {
                "vorname": "Hans-Joachim",
                "nachname": "Lüdenscheid",
                "strasse": "An der großen Brücke",
                "hnr": "192a",
                "telnr": "+49 151 99886677",
                "email": "hjo.luedie@mac.com"
            },
            "to": {
                "titel": "Herr",
                "name1": "Hans Müller",
                "strasse": "Unter den Eichen",
                "hnr": "142",
                "plz": "14163",
                "ort": "Berlin",
                "anrede": "Sehr geehrter Herr Müller"
            },
            "leistung": [
                { "nr": 100, "bezeichnung": "Haselnüsse", "preis": 4.50 },
                { "nr": 101, "bezeichnung": "Sonderzeichen €¢¥£µ©®§", "preis": 6.75 }
            ],
            "auftrag": {
                "datum": new Date()
            }
        }
    )
```

### 1.5 Variablen im RTF Template
The variables in the RTF template must have the following notation:

### Fields
:#field:<Variable>:<Format>#:

### Tables (Array)
:#array:<Variable>:<Format>#:

with <Variable> the Json notation of the variable e.g. for the surname of the data structure "name.nachname" and for date. 
or numeric fields with the format options of the function " toLocaleString()", e.g.
Date - {"weekday": "long", "year": "numeric", "month": "long", "day": "numeric"} generates e.g. "Freitag, 04 Ferbuar 2022" for "de-DE".
Number - {"style": "currency", "currency": "EUR"} generates e.g. "123,00 €".

```
:#field:name.nachname:#:
:#field:name.strasse:#:
:#field:auftrag.datum:"weekday": "long", "year": "numeric", "month": "long", "day": "numeric":#:
:#array:leistung.nr:#:
:#array:leistung.preis:"style": "currency", "currency": "EUR" :#:
```
### Restrictions for the variables 
1. Use only lower case letters without umlauts for the variable names. 
2. When inserting into RTF (or MS Word -> RTF), copy as pure ASCII or enter one after the other so that no control characters get between the characters and the variable cannot otherwise be recognised/parsed. 
3. The table (array) is only recognised and processed at the top level. 

In case of an error, check the spelling of the variable, delete it completely if necessary and insert it again.

## 2. Template and correspondences
- Save RTF template as documents in memory
- create an RTF correspondence from a template and data (Json)
- create a PDF from an RTF file (via OpenOffice as a batch)

## 3. PDF Dateien 
- extract the text from a PDF
-- if the PDF contains text, this text will be extracted directly.
-- if the PDF is a scanned text, the JPG of each page will be 
   extracted, converted to a TIFF (via ghostscript as a batch) and then
   then converted to text via Tesseract OCR
- convert the file from/to base64 

## 4. Requirement
### 4.1 Ghostscript 
Extraction of the pages from the PDF as JPG files
```
apt-get -y update; apt-get -y install ghostscript
```

### 4.2 Tesseract OCR
Tesseract will generate OCR text from the JPG pages of the PDF.
The installation for e.g. language German:
```
apt-get -y update; apt-get -y install tesseract-ocr; apt-get -y install tesseract-ocr-deu
```

### 4.3 OpenOffice
OpenOffice is used to create a PDF from an RFT file.
The installation for e.g. language German:
```
apt-get -y update; apt-get -y install libreoffice libreoffice-l10n-de libreoffice-help-de
```

### 4.4 checkInstallation()
Checks whether the applications are installed on the server and if the parameter "iInstall" is set to "true", the installation is carried out on a Linux system with the "get-apt" command:
```
    //Checking the installation of gs, tesseract and openoffice
    let lInstData = await rtf2pdf.checkInstallation(true, "de-DE")
    console.log(`\nStart 'checkInstallation'`)
    for (element in lInstData.data) {
        console.log(`** ${element}: ${lInstData.data[element]}`)
    }
```

The best way is to install the applications separately on the server.

## 5 Example
```
    //Checking the installation of gs, tesseract and openoffice
    let lInstData = await rtf2pdf.checkInstallation(true, "de-DE")
    console.log(`\nStart 'checkInstallation'`)
    for (element in lInstData.data) {
        console.log(`** ${element}: ${lInstData.data[element]}`)
    }

    //Regsitrate new RTF template 
    let lDoc1 = rtf2pdf.newTemplateByFile('test', 'test/Brief1.rtf');
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
                "nachname": "Lüdenscheid",
                "strasse": "An der großen Brücke",
                "hnr": "192a",
                "telnr": "+49 151 99886677",
                "email": "hjo.luedie@mac.com"
            },
            "to": {
                "titel": "Herr",
                "name1": "Hans Müller",
                "strasse": "Unter den Eichen",
                "hnr": "142",
                "plz": "14163",
                "ort": "Berlin",
                "anrede": "Sehr geehrter Herr Müller"
            },
            "leistung": [
                { "nr": 100, "bezeichnung": "Haselnüsse", "preis": 4.50 },
                { "nr": 101, "bezeichnung": "Sonderzeichen €¢¥£µ©®§", "preis": 6.75 }
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
            console.log('** '+text)
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

    //Create a PDF document
    let lDoc4 = new Document({ subject: "test PDF to Text", type: "PDF", filename: "test/Rechnung1.PDF", langu: 'de-DE' })
    //convert the PDF to text using tesseract 
    await lDoc4.convertPDFToTextBody();
    console.log(`PDF document ${lDoc4.filename} converts to text`)
    lDoc4.protocol.forEach((text) => {
        console.log(text)
    })

```
 