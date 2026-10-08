document.addEventListener('DOMContentLoaded', function() {
    
    // 1. مراجع العناصر والـ Containers الأساسية لضمان سلامة الكود
    const personalForm = document.getElementById('personalInfoForm');
    const step1Container = document.getElementById('step1Container');
    const step2Container = document.getElementById('step2Container');
    const step3Container = document.getElementById('step3Container');
    const specSelect = document.getElementById('specializationSelect');
    const otherGroup = document.getElementById('otherSpecializationGroup');
    const otherInput = document.getElementById('otherSpecializationInput');
    const header = document.querySelector('.main-header');
    const typingTarget = document.getElementById("typing-text");

    // 2. منطق إظهار حقل "تخصص غيره" بشكل آمن
    if (specSelect && otherGroup && otherInput) {
        specSelect.addEventListener('change', function() {
            if (this.value === 'other') {
                otherGroup.style.display = 'block';
                otherInput.required = true;
            } else {
                otherGroup.style.display = 'none';
                otherInput.required = false;
                otherInput.value = ""; 
            }
        });
    }

    // 3. منطق زر التالي (الانتقال للخطوة الثانية بالنموذج)
    if (personalForm) {
        personalForm.addEventListener('submit', function(e) {
            e.preventDefault(); 
            
            if (step1Container && step2Container) {
                step1Container.style.display = 'none';
                step2Container.style.display = 'block';
            }

            // تحديث مؤشرات الـ Stepper العلوي للخطوة الثانية
            const step1 = document.getElementById('stepIndicator1');
            const step2 = document.getElementById('stepIndicator2');
            const line1 = document.getElementById('stepLine1');

            if (step1 && step2) {
                step1.classList.remove('step--active');
                step1.innerHTML = '<span class="step__number"><i class="fa-solid fa-check"></i></span><span class="step__label">البيانات الشخصية</span>';
                step1.style.color = '#28B58F';

                step2.classList.add('step--active');
                if (line1) line1.style.backgroundColor = '#28B58F';
            }
            
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // 4. العودة للخطوة الأولى بنموذج التسجيل
    document.getElementById('backToStep1')?.addEventListener('click', function(e) {
        e.preventDefault();
        if (step1Container && step2Container) {
            step2Container.style.display = 'none';
            step1Container.style.display = 'block';
        }
    });

    // 6. تأثير الشفافية والانتقال عند تمرير نافذة الهيدر العلوي
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                header.style.backgroundColor = 'rgba(37, 50, 59, 1)';
                header.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
            } else {
                header.style.backgroundColor = 'rgba(37, 50, 59, 0.95)';
                header.style.boxShadow = 'none';
            }
        });
    }

    // 7. تفعيل تأثير النص المتحرك (Typing Effect)
    if (typingTarget) {
        const words = ["تفاعلية", "متطورة", "مبتكرة", "حيوية"];
        let i = 0;
        function typeWord() {
            typingTarget.textContent = words[i];
            i = (i + 1) % words.length;
        }
        setInterval(typeWord, 2000);
        typeWord();
    }

    // 8. مصفوفة أسئلة اللجان الستة المعتمدة
    const committeeQuestions = {
        "التقنية": [
            { type: "checkbox", text: "ما هي لغات البرمجة التي تتقنها؟", required: true, options: ["JavaScript", "Python", "Java", "C++", "أخرى"] },
            { type: "radio", text: "ما مستوى خبرتك في البرمجة؟", required: true, options: ["مبتدئ", "متوسط", "متقدم", "محترف"] },
            { type: "textarea", text: "صف لنا مشروعاً برمجياً قمت بتطويره", required: true, placeholder: "اكتب وصفاً للمشروع..." },
            { type: "text", text: "ما هي التقنيات والأطر (Frameworks) التي تستخدمها؟", required: true, placeholder: "مثال: React, Node.js, Laravel..." },
            { type: "text", text: "هل لديك حساب على GitHub أو موقع شخصي؟ (اختياري)", required: false, placeholder: "https://github.com/username" }
        ],
        "التصميم": [
            { type: "checkbox", text: "ما هي مجالات التصميم التي تبدع فيها؟", required: true, options: ["تصميم واجهات UI/UX", "هويات بصرية وشعارات", "منشورات وسائل التواصل", "أخرى"] },
            { type: "radio", text: "ما هي الأداة أو البرنامج الأساسي والمفضل لديك؟", required: true, options: ["Figma", "Adobe Illustrator", "Adobe Photoshop"] },
            { type: "textarea", text: "صف لنا أسلوبك في التصميم أو تحدٍ واجهته في مشروع سابق وكيف حللته.", required: true, placeholder: "اكتب تجربتك هنا..." },
            { type: "text", text: "أرفق رابط معرض أعمالك السابقة (Portfolio).", required: true, placeholder: "Behance, Dribbble, Drive..." }
        ],
        "الفعاليات والعلاقات": [
            { type: "radio", text: "هل لديك خبرة سابقة في تنظيم وإدارة الفعاليات (الواقعية أو عن بعد)؟", required: true, options: ["نعم", "لا"] },
            { type: "checkbox", text: "ما هي المهارات التي تجد نفسك متمكناً فيها؟", required: true, options: ["التخطيط اللوجستي", "التقديم وإدارة الحوار", "التواصل مع المتحدثين", "بناء الشراكات والاستقطاب"] },
            { type: "textarea", text: "اذكر فعالية تقنية شاركت في تنظيمها سابقاً، وماذا كان دورك بالتحديد؟", required: true, placeholder: "اسم الفعالية ودورك بالتحديد..." },
            { type: "textarea", text: "لو اعتذر أحد المتحدثين قبل انطلاق الورشة بـ 30 دقيقة، كيف ستتصرف؟", required: true, placeholder: "اكتب خطتك البديلة هنا..." }
        ],
        "المتابعة والتطوير": [
            { type: "radio", text: "كيف تقيم مستوى إتقانك لأدوات إدارة المشاريع والمتابعة؟", required: true, options: ["مبتدئ", "متوسط", "متقدم"] },
            { type: "checkbox", text: "ما هي الأدوات التي تفضل استخدامها لمتابعة سير العمل؟", required: true, options: ["Trello", "ClickUp", "Notion", "Excel / Google Sheets"] },
            { type: "textarea", text: "كيف تتعامل مع عضو في الفريق يتأخر باستمرار في تسليم المهام الموكلة إليه؟", required: true, placeholder: "اكتب أسلوبك في التعامل هنا..." },
            { type: "textarea", text: "من وجهة نظرك، ما هي أفضل طريقة لضمان جودة مخرجات اللجان قبل إطلاقها للعلن؟", required: true, placeholder: "اكتب وجهة نظرك هنا..." }
        ],
        "الإعلام": [
            { type: "checkbox", text: "ما هو مجالك الإعلامي الأساسي؟", required: true, options: ["صناعة ومونتاج الفيديو", "التصوير الفوتوغرافي/السينمائي", "التغطيات الحية وإدارة الحسابات", "التعليق الصوتي"] },
            { type: "checkbox", text: "ما هي البرامج التي تستخدمها بمهارة في إنتاجك؟", required: true, options: ["Premiere Pro", "After Effects", "DaVinci Resolve", "Photoshop/Lightroom", "أخرى"] },
            { type: "textarea", text: "إذا طُلب منك إعداد خطة تغطية إعلامية سريعة لفعالية تقنية مباشرة، ما هي الأدوات والخطوات التي ستعتمد عليها؟", required: true, placeholder: "اكتب خطتك الإعلامية هنا..." },
            { type: "text", text: "أرفق رابطاً لنماذج من إنتاجك المرئي أو الفوتوغرافي.", required: true, placeholder: "Drive, Behance, YouTube..." }
        ],
        "المحتوى": [
            { type: "checkbox", text: "ما هي أنواع المحتوى التي تفضل كتابتها وصياغتها؟", required: true, options: ["ثريدات منصة X التقنية", "مقالات ومناهج تعليمية", "سيناريو للفيديوهات والبودكاست", "محتوى تسويقي وإعلاني"] },
            { type: "radio", text: "كيف تقيم قدرتك على تبسيط المفاهيم التقنية المعقدة للمجتمع العام؟", required: true, options: ["ممتازة", "جيدة جداً", "أحتاج لتطويرها"] },
            { type: "textarea", text: "اكتب نصاً تشويقياً قصيراً (لا يتجاوز سطرين) للإعلان عن ورشة عمل قادمة في 'الذكاء الاصطناعي'.", required: true, placeholder: "اكتب النص التشويقي هنا..." },
            { type: "text", text: "أرفق نموذجاً أو رابطاً لكتابات سابقة قمت بإعدادها إن وجد.", required: false, placeholder: "رابط ثريد, مقال، أو ملف..." }
        ]
    };

    // 9. وظيفة الانتقال للأسئلة وبنائها ديناميكياً
    function goToQuestions(committeeName) {
        const titleElem = document.getElementById('committeeQuestionTitle');
        if (titleElem) {
            titleElem.textContent = committeeName;
        }
        
        if (step2Container && step3Container) {
            step2Container.style.display = 'none';
            step3Container.style.display = 'block';
        }
        
        const step2 = document.getElementById('stepIndicator2');
        const step3 = document.getElementById('stepIndicator3');
        const line2 = document.getElementById('stepLine2');

        if (step2 && step3) {
            step2.classList.replace('step--active', 'step--completed');
            step2.innerHTML = '<span class="step__number"><i class="fa-solid fa-check"></i></span><span class="step__label">اختيار اللجنة</span>';
            step2.style.color = '#28B58F';
            
            step3.classList.add('step--active');
        }
        if (line2) {
            line2.style.backgroundColor = '#28B58F';
        }

        const questionsArea = document.getElementById('dynamicQuestions');
        if (questionsArea) {
            questionsArea.innerHTML = ""; 
            
            const questions = committeeQuestions[committeeName] || committeeQuestions["التقنية"];
            
            questions.forEach((q, index) => {
                const requiredStars = q.required ? '<span class="q-required" style="color: #ef4444; margin-right: 4px;">*</span>' : '';
                
                let html = `
                    <div class="question-row" data-required="${q.required}" style="margin-bottom: 25px; text-align: right;">
                        <div class="q-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                            <div class="q-num">${index + 1}</div>
                            <div class="q-text" style="font-weight: 700; font-size: 1rem; color: #25323B;">${q.text} ${requiredStars}</div>
                        </div>`;
                
                if (q.type === "radio" || q.type === "checkbox") {
                    html += `<div class="options-horizontal">`;
                    q.options.forEach(opt => {
                        html += `
                            <label class="option-item">
                                <input type="${q.type}" name="q${index}" value="${opt}" ${q.required && q.type === 'radio' ? 'required' : ''}>
                                <span>${opt}</span>
                            </label>`;
                    });
                    html += `</div>`;
                } else if (q.type === "textarea") {
                    html += `<textarea class="form-group__textarea" name="q${index}" rows="4" maxlength="2000" placeholder="${q.placeholder}" ${q.required ? 'required' : ''}></textarea>`;
                } else {
                    html += `<input type="text" name="q${index}" maxlength="2000" class="form-group__input" placeholder="${q.placeholder}" ${q.required ? 'required' : ''}>`;
                }
                
                html += `</div>`;
                questionsArea.innerHTML += html;
            });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 10. ربط حدث الضغط على بطاقات اللجان
    const cards = document.querySelectorAll('.committee-card');
    if (cards.length > 0) {
        cards.forEach(card => {
            card.addEventListener('click', function() {
                cards.forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');

                const nameElement = this.querySelector('.committee-card__name');
                if (nameElement) {
                    const name = nameElement.textContent.trim();
                    setTimeout(() => goToQuestions(name), 400); 
                }
            });
        });
    }

    // 11. العودة من الخطوة الثالثة إلى الخطوة الثانية
    document.getElementById('backToStep2')?.addEventListener('click', function(e) {
        e.preventDefault();
        if (step2Container && step3Container) {
            step3Container.style.display = 'none';
            step2Container.style.display = 'block';
        }
        const step2 = document.getElementById('stepIndicator2');
        const step3 = document.getElementById('stepIndicator3');
        if (step2 && step3) {
            step3.classList.remove('step--active');
            step2.classList.replace('step--completed', 'step--active');
            step2.innerHTML = '<span class="step__number">2</span><span class="step__label">اختيار اللجنة</span>';
        }
    });

    // 13. تصفية وعرض القسم المختار داخل صفحة departments.html
    const deptCards = document.querySelectorAll('.departments-page-container .info-card');
    if (deptCards.length > 0) {
        function filterDepartments() {
            const currentHash = window.location.hash; 
            if (currentHash && currentHash.includes('-dept')) {
                deptCards.forEach(card => {
                    if ('#' + card.id === currentHash) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                });
            } else {
                deptCards.forEach(card => {
                    card.style.display = 'block';
                });
            }
        }
        window.addEventListener('load', filterDepartments);
        window.addEventListener('hashchange', filterDepartments);
    }

    // Animate the existing published statistics once when visible.
    const statsSection = document.querySelector('.stats-section');
    const statNumbers = document.querySelectorAll('.stat-number');

    if (statsSection && statNumbers.length > 0) {
        const startCounters = () => {
            statNumbers.forEach(stat => {
                const fullText = stat.textContent.trim();
                // Values without digits are shown exactly as written.
                if (!/[0-9]/.test(fullText)) return;
                const targetNumber = parseInt(fullText.replace(/[^0-9]/g, ''), 10);
                const suffix = fullText.replace(/[0-9]/g, ''); 
                
                let current = 0;
                const duration = 2000; 
                
                const stepTime = Math.max(Math.floor(duration / targetNumber), 10);
                const increment = targetNumber > 100 ? Math.ceil(targetNumber / 80) : 1;

                const counter = setInterval(() => {
                    // A database value that arrives mid-animation replaces the old number.
                    if (stat.dataset.final && stat.dataset.final !== fullText) {
                        stat.textContent = stat.dataset.final;
                        clearInterval(counter);
                        return;
                    }
                    current += increment;
                    if (current >= targetNumber) {
                        // End on the value exactly as written (e.g. "1,200+", "+50").
                        stat.textContent = fullText;
                        clearInterval(counter);
                    } else {
                        stat.textContent = current + suffix;
                    }
                }, stepTime);
            });
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    startCounters();
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });

        observer.observe(statsSection);
    }


});
